import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { kv } from "@/lib/cache";
import { consumeStockForOrder } from "@/modules/recipes/service/recipe.service";
import { financeService } from "@/modules/finance/service/finance.service";
import type { TenantContext } from "@/lib/auth/context";
import type { PlaceOrderInput, OrderHistoryQuery } from "../dto/order.dto";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Place an order atomically: price lines from the live menu (never trust client
 * prices), compute totals, create the order + kitchen ticket, and optionally
 * record payment. Returns the created order with items.
 */
export async function placeOrder(ctx: TenantContext, input: PlaceOrderInput) {
  if (!ctx.branchId) throw new DomainError("VALIDATION_ERROR", "Select a branch first.");
  const branchId = ctx.branchId;

  const menuItems = await prisma.menuItem.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      id: { in: input.lines.map((l) => l.menuItemId) },
    },
    include: { variants: { where: { deletedAt: null } } },
  });
  const itemById = new Map(menuItems.map((m) => [m.id, m]));

  // Price each line server-side
  const pricedLines = input.lines.map((line) => {
    const item = itemById.get(line.menuItemId);
    if (!item) throw new DomainError("VALIDATION_ERROR", "One of the items is no longer available.");
    const variant = line.variantId ? item.variants.find((v) => v.id === line.variantId) : null;
    if (line.variantId && !variant) {
      throw new DomainError("VALIDATION_ERROR", `Variant not found for ${item.name}.`);
    }
    const unitPrice = round2(Number(item.basePrice) + Number(variant?.priceDelta ?? 0));
    const lineTotal = round2(unitPrice * line.quantity);
    return {
      menuItemId: item.id,
      variantId: variant?.id ?? null,
      nameSnapshot: variant ? `${item.name} (${variant.name})` : item.name,
      quantity: line.quantity,
      unitPrice,
      taxRate: Number(item.taxRate),
      lineTotal,
      notes: line.notes || null,
    };
  });

  const subtotal = round2(pricedLines.reduce((sum, l) => sum + l.lineTotal, 0));

  let discountAmount = 0;
  if (input.discount) {
    discountAmount =
      input.discount.type === "PERCENTAGE"
        ? round2((subtotal * input.discount.value) / 100)
        : round2(Math.min(input.discount.value, subtotal));
  }

  const taxableBase = subtotal - discountAmount;
  const taxAmount = round2(
    pricedLines.reduce((sum, l) => {
      const lineShare = subtotal > 0 ? l.lineTotal / subtotal : 0;
      return sum + taxableBase * lineShare * (l.taxRate / 100);
    }, 0),
  );

  const tipAmount = round2(input.tipAmount);
  const totalAmount = round2(taxableBase + taxAmount + tipAmount);

  if (input.payment && round2(input.payment.amount) < totalAmount) {
    throw new DomainError("VALIDATION_ERROR", "Payment amount is less than the order total.");
  }

  const order = await prisma.$transaction(async (tx) => {
    const orderCount = await tx.order.count({ where: { branchId } });
    const orderNumber = `ORD-${String(orderCount + 1).padStart(6, "0")}`;

    const order = await tx.order.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        orderNumber,
        type: input.type,
        orderStatus: input.payment ? "PLACED" : "DRAFT",
        tableId: input.tableId ?? null,
        customerId: input.customerId ?? null,
        guestCount: input.guestCount ?? null,
        notes: input.notes || null,
        subtotal,
        discountAmount,
        taxAmount,
        tipAmount,
        totalAmount,
        paidAmount: input.payment ? round2(input.payment.amount) : 0,
        placedAt: new Date(),
        createdById: ctx.userId,
        items: { create: pricedLines },
        ...(input.discount
          ? {
              discounts: {
                create: {
                  label: input.discount.label,
                  discountType: input.discount.type,
                  value: input.discount.value,
                  amount: discountAmount,
                },
              },
            }
          : {}),
      },
      include: { items: true },
    });

    if (input.payment) {
      await tx.payment.create({
        data: {
          organizationId: ctx.organizationId,
          branchId,
          orderId: order.id,
          method: input.payment.method,
          paymentStatus: "CAPTURED",
          amount: round2(input.payment.amount),
          tipAmount,
          processedAt: new Date(),
          createdById: ctx.userId,
        },
      });
    }

    const ticketCount = await tx.kitchenTicket.count({ where: { branchId } });
    await tx.kitchenTicket.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        orderId: order.id,
        ticketNumber: `KT-${String(ticketCount + 1).padStart(6, "0")}`,
        items: {
          create: order.items.map((item) => ({
            orderItemId: item.id,
            nameSnapshot: item.nameSnapshot,
            quantity: item.quantity,
            notes: item.notes,
          })),
        },
      },
    });

    if (input.tableId) {
      await tx.diningTable.updateMany({
        where: { id: input.tableId, organizationId: ctx.organizationId },
        data: { tableStatus: "OCCUPIED" },
      });
    }

    // A delivery order is not dispatchable until it has a run to dispatch, so
    // the Delivery row is created with the order rather than by a later step.
    if (input.type === "DELIVERY") {
      const address = (input.deliveryAddress ?? "").trim();
      // The DTO already refuses a delivery without one; this keeps the service
      // honest for any non-HTTP caller.
      if (!address) {
        throw new DomainError("VALIDATION_ERROR", "Enter a delivery address.", {
          deliveryAddress: "Required for delivery orders",
        });
      }
      const zone = input.zoneId
        ? await tx.deliveryZone.findFirst({
            where: { id: input.zoneId, organizationId: ctx.organizationId, deletedAt: null },
            select: { id: true },
          })
        : null;
      await tx.delivery.create({
        data: {
          organizationId: ctx.organizationId,
          branchId,
          orderId: order.id,
          address,
          zoneId: zone?.id ?? null,
          deliveryStatus: "PENDING",
        },
      });
    }

    return order;
  });

  audit(ctx, { action: "orders.place", entityType: "Order", entityId: order.id, after: { orderNumber: order.orderNumber, totalAmount } });

  // Post the sale to the ledger so it shows up in Finance revenue. Deliberately
  // outside the order transaction and non-fatal: a chart-of-accounts problem
  // must not void a sale the customer has already paid for.
  if (input.payment) {
    await financeService
      .postOrderRevenue(ctx, order)
      .catch((error) => console.error("Ledger posting failed for order", order.id, error));
  }

  await kv.del(`dash:${ctx.organizationId}:${ctx.branchId}`).catch(() => undefined);
  await kv.del(`dash:${ctx.organizationId}:all`).catch(() => undefined);

  return order;
}

export async function listKitchenTickets(ctx: TenantContext) {
  return prisma.kitchenTicket.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      ticketStatus: { in: ["NEW", "COOKING", "READY"] },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 60,
    include: {
      items: true,
      order: { select: { orderNumber: true, type: true, notes: true, table: { select: { name: true } } } },
    },
  });
}

export async function updateTicketStatus(
  ctx: TenantContext,
  ticketId: string,
  status: "NEW" | "COOKING" | "READY" | "COMPLETED" | "CANCELLED",
) {
  const ticket = await prisma.kitchenTicket.findFirst({
    where: { id: ticketId, organizationId: ctx.organizationId },
  });
  if (!ticket) throw new DomainError("NOT_FOUND", "Ticket not found.");

  const timestamps: Record<string, Date> = {};
  if (status === "COOKING" && !ticket.startedAt) timestamps.startedAt = new Date();
  if (status === "READY") timestamps.readyAt = new Date();
  if (status === "COMPLETED") timestamps.completedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.kitchenTicket.update({
      where: { id: ticketId },
      data: { ticketStatus: status, ...timestamps },
    });
    // Reflect kitchen progress on the order
    const orderStatus =
      status === "COOKING" ? "PREPARING" : status === "READY" ? "READY" : status === "COMPLETED" ? "SERVED" : null;
    if (orderStatus) {
      await tx.order.updateMany({
        where: { id: ticket.orderId, organizationId: ctx.organizationId },
        data: { orderStatus },
      });
    }
  });

  // Completing a ticket deducts recipe ingredients from stock (idempotent per order).
  if (status === "COMPLETED") {
    await consumeStockForOrder(ctx, ticket.orderId).catch((e) =>
      console.error("Stock consumption failed for order", ticket.orderId, e),
    );
  }

  audit(ctx, { action: "kds.status", entityType: "KitchenTicket", entityId: ticketId, after: { status } });
}

export async function listRecentOrders(ctx: TenantContext, limit = 20) {
  return prisma.order.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      orderNumber: true,
      type: true,
      orderStatus: true,
      totalAmount: true,
      createdAt: true,
      table: { select: { name: true } },
    },
  });
}

export interface OrderHistoryResult {
  orders: {
    id: string;
    orderNumber: string;
    type: string;
    orderStatus: string;
    tableName: string | null;
    customerName: string | null;
    customerPhone: string | null;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    tipAmount: number;
    totalAmount: number;
    paidAmount: number;
    placedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    cancelReason: string | null;
    createdAt: Date;
    items: { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number }[];
    payments: { method: string; amount: number; status: string }[];
  }[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Full order history with filters, pagination and item details. */
export async function listOrderHistory(ctx: TenantContext, query: OrderHistoryQuery = {}): Promise<OrderHistoryResult> {
  const PAGE_SIZE = 50;
  const page = Math.max(1, query.page ?? 1);

  function parseDay(value: string) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const from = query.from ? parseDay(query.from) : (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 29);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  })();

  const to = query.to ? (() => {
    const d = parseDay(query.to);
    d.setUTCDate(d.getUTCDate() + 1); // inclusive upper bound
    return d;
  })() : new Date();

  const where = {
    organizationId: ctx.organizationId,
    ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
    deletedAt: null,
    createdAt: { gte: from, lt: to },
    ...(query.status && query.status !== "ALL" ? { orderStatus: query.status as never } : {}),
    ...(query.type && query.type !== "ALL" ? { type: query.type as never } : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: "insensitive" as const } },
            { customer: { OR: [
              { firstName: { contains: query.search, mode: "insensitive" as const } },
              { lastName: { contains: query.search, mode: "insensitive" as const } },
            ]}},
          ],
        }
      : {}),
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        table: { select: { name: true } },
        customer: { select: { firstName: true, lastName: true, phone: true } },
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
        payments: {
          select: { method: true, amount: true, paymentStatus: true },
        },
      },
    }),
  ]);

  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      type: o.type,
      orderStatus: o.orderStatus,
      tableName: o.table?.name ?? null,
      customerName: o.customer
        ? `${o.customer.firstName} ${o.customer.lastName ?? ""}`.trim()
        : null,
      customerPhone: o.customer?.phone ?? null,
      subtotal: Number(o.subtotal),
      discountAmount: Number(o.discountAmount),
      taxAmount: Number(o.taxAmount),
      tipAmount: Number(o.tipAmount),
      totalAmount: Number(o.totalAmount),
      paidAmount: Number(o.paidAmount),
      placedAt: o.placedAt,
      completedAt: o.completedAt,
      cancelledAt: o.cancelledAt,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({
        id: i.id,
        name: i.nameSnapshot,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
      })),
      payments: o.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        status: p.paymentStatus,
      })),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
  };
}
