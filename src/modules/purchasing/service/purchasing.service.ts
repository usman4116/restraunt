import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import { ensureDefaultWarehouse } from "@/modules/inventory/service/inventory.service";
import type {
  SupplierInput,
  PurchaseOrderInput,
  ReceiveGoodsInput,
} from "../dto/purchasing.dto";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** New weighted-average unit cost after receiving `qty` at `unitCost`. */
export function weightedAverageCost(
  onHand: number,
  avgCost: number,
  qty: number,
  unitCost: number,
): number {
  const base = Math.max(0, onHand);
  if (base + qty <= 0) return unitCost;
  return round4((base * avgCost + qty * unitCost) / (base + qty));
}

export const supplierService = {
  list(ctx: TenantContext) {
    return prisma.supplier.findMany({
      where: tenantWhere(ctx),
      orderBy: { name: "asc" },
      include: { _count: { select: { purchaseOrders: true } } },
    });
  },

  async create(ctx: TenantContext, input: SupplierInput) {
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        contactName: input.contactName || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        paymentTermsDays: input.paymentTermsDays,
        createdById: ctx.userId,
      },
    });
    audit(ctx, { action: "suppliers.create", entityType: "Supplier", entityId: supplier.id, after: supplier });
    return supplier;
  },

  async update(ctx: TenantContext, id: string, input: SupplierInput) {
    const before = await prisma.supplier.findFirst({ where: { ...tenantWhere(ctx), id } });
    if (!before) throw new DomainError("NOT_FOUND", "Supplier not found.");
    await prisma.supplier.update({
      where: { id },
      data: {
        name: input.name,
        contactName: input.contactName || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        paymentTermsDays: input.paymentTermsDays,
        updatedById: ctx.userId,
      },
    });
    audit(ctx, { action: "suppliers.update", entityType: "Supplier", entityId: id, before, after: input });
  },

  async remove(ctx: TenantContext, id: string) {
    const openPo = await prisma.purchaseOrder.findFirst({
      where: {
        ...tenantWhere(ctx),
        supplierId: id,
        poStatus: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "PARTIALLY_RECEIVED"] },
      },
      select: { poNumber: true },
    });
    if (openPo) {
      throw new DomainError("CONFLICT", `Supplier has an open purchase order (${openPo.poNumber}).`);
    }
    const result = await prisma.supplier.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { deletedAt: new Date(), updatedById: ctx.userId },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Supplier not found.");
    audit(ctx, { action: "suppliers.delete", entityType: "Supplier", entityId: id });
  },
};

export const purchasingService = {
  listOrders(ctx: TenantContext) {
    return prisma.purchaseOrder.findMany({
      where: tenantWhere(ctx),
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        supplier: { select: { name: true } },
        items: {
          include: { item: { select: { name: true, unit: true } } },
        },
      },
    });
  },

  /** Create a PO in PENDING_APPROVAL with server-computed totals. */
  async createOrder(ctx: TenantContext, input: PurchaseOrderInput) {
    const supplier = await prisma.supplier.findFirst({
      where: { ...tenantWhere(ctx), id: input.supplierId },
      select: { id: true },
    });
    if (!supplier) throw new DomainError("NOT_FOUND", "Supplier not found.");

    const itemIds = input.lines.map((l) => l.inventoryItemId);
    const itemCount = await prisma.inventoryItem.count({
      where: { ...tenantWhere(ctx), id: { in: itemIds } },
    });
    if (itemCount !== itemIds.length) {
      throw new DomainError("VALIDATION_ERROR", "One of the items no longer exists.");
    }

    const lines = input.lines.map((l) => {
      const lineTotal = round2(l.quantity * l.unitCost);
      return { ...l, lineTotal, taxAmount: round2(lineTotal * (l.taxRate / 100)) };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));

    const po = await prisma.$transaction(async (tx) => {
      const count = await tx.purchaseOrder.count({ where: { organizationId: ctx.organizationId } });
      return tx.purchaseOrder.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: ctx.branchId,
          supplierId: input.supplierId,
          poNumber: `PO-${String(count + 1).padStart(6, "0")}`,
          poStatus: "PENDING_APPROVAL",
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
          notes: input.notes || null,
          subtotal,
          taxAmount,
          totalAmount: round2(subtotal + taxAmount),
          createdById: ctx.userId,
          items: {
            create: lines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              quantity: l.quantity,
              unitCost: l.unitCost,
              taxRate: l.taxRate,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });
    });

    audit(ctx, {
      action: "purchasing.po.create",
      entityType: "PurchaseOrder",
      entityId: po.id,
      after: { poNumber: po.poNumber, totalAmount: po.totalAmount },
    });
    return po;
  },

  async approveOrder(ctx: TenantContext, id: string) {
    const po = await prisma.purchaseOrder.findFirst({ where: { ...tenantWhere(ctx), id } });
    if (!po) throw new DomainError("NOT_FOUND", "Purchase order not found.");
    if (po.poStatus !== "PENDING_APPROVAL" && po.poStatus !== "DRAFT") {
      throw new DomainError("CONFLICT", `Cannot approve a ${po.poStatus.toLowerCase()} order.`);
    }
    await prisma.purchaseOrder.update({
      where: { id },
      data: { poStatus: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() },
    });
    audit(ctx, { action: "purchasing.po.approve", entityType: "PurchaseOrder", entityId: id });
  },

  async cancelOrder(ctx: TenantContext, id: string) {
    const po = await prisma.purchaseOrder.findFirst({ where: { ...tenantWhere(ctx), id } });
    if (!po) throw new DomainError("NOT_FOUND", "Purchase order not found.");
    if (["PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"].includes(po.poStatus)) {
      throw new DomainError("CONFLICT", `Cannot cancel a ${po.poStatus.toLowerCase().replace("_", " ")} order.`);
    }
    await prisma.purchaseOrder.update({
      where: { id },
      data: { poStatus: "CANCELLED", updatedById: ctx.userId },
    });
    audit(ctx, { action: "purchasing.po.cancel", entityType: "PurchaseOrder", entityId: id });
  },

  /**
   * Receive goods against an approved PO: writes a GoodsReceipt, adds
   * PURCHASE_RECEIPT ledger rows, increments stock, and updates each item's
   * weighted-average cost. Partial receipts are supported.
   */
  async receiveGoods(ctx: TenantContext, input: ReceiveGoodsInput) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { ...tenantWhere(ctx), id: input.purchaseOrderId },
      include: { items: true },
    });
    if (!po) throw new DomainError("NOT_FOUND", "Purchase order not found.");
    if (!["APPROVED", "SENT", "PARTIALLY_RECEIVED"].includes(po.poStatus)) {
      throw new DomainError("CONFLICT", "Order must be approved before receiving.");
    }

    const poItemById = new Map(po.items.map((i) => [i.id, i]));
    const receiptLines = input.lines
      .map((line) => {
        const poItem = poItemById.get(line.purchaseOrderItemId);
        if (!poItem) throw new DomainError("VALIDATION_ERROR", "Line does not belong to this order.");
        const remaining = round3(Number(poItem.quantity) - Number(poItem.receivedQty));
        return { poItem, qty: round3(Math.min(line.receivedQty, remaining)) };
      })
      .filter((l) => l.qty > 0);
    if (receiptLines.length === 0) {
      throw new DomainError("VALIDATION_ERROR", "Nothing to receive.");
    }

    const receipt = await prisma.$transaction(async (tx) => {
      const warehouse = await ensureDefaultWarehouse(ctx, tx);
      const receiptCount = await tx.goodsReceipt.count({
        where: { organizationId: ctx.organizationId },
      });
      const receipt = await tx.goodsReceipt.create({
        data: {
          organizationId: ctx.organizationId,
          purchaseOrderId: po.id,
          warehouseId: warehouse.id,
          receiptNumber: `GR-${String(receiptCount + 1).padStart(6, "0")}`,
          notes: input.notes || null,
          createdById: ctx.userId,
        },
      });

      for (const { poItem, qty } of receiptLines) {
        const unitCost = Number(poItem.unitCost);

        await tx.stockMovement.create({
          data: {
            organizationId: ctx.organizationId,
            branchId: ctx.branchId,
            warehouseId: warehouse.id,
            inventoryItemId: poItem.inventoryItemId,
            type: "PURCHASE_RECEIPT",
            quantity: qty,
            unitCost,
            referenceType: "purchase_order",
            referenceId: po.id,
            createdById: ctx.userId,
          },
        });

        // Weighted-average cost over current on-hand + received quantity
        const levels = await tx.stockLevel.aggregate({
          where: { organizationId: ctx.organizationId, inventoryItemId: poItem.inventoryItemId },
          _sum: { quantity: true },
        });
        const onHand = Number(levels._sum.quantity ?? 0);
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: poItem.inventoryItemId },
          select: { avgCost: true },
        });
        const newAvg = weightedAverageCost(onHand, Number(item.avgCost), qty, unitCost);

        await tx.inventoryItem.update({
          where: { id: poItem.inventoryItemId },
          data: { avgCost: newAvg, lastCost: unitCost, updatedById: ctx.userId },
        });
        await tx.stockLevel.upsert({
          where: {
            warehouseId_inventoryItemId: {
              warehouseId: warehouse.id,
              inventoryItemId: poItem.inventoryItemId,
            },
          },
          create: {
            organizationId: ctx.organizationId,
            warehouseId: warehouse.id,
            inventoryItemId: poItem.inventoryItemId,
            quantity: qty,
          },
          update: { quantity: { increment: qty } },
        });
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQty: { increment: qty } },
        });
      }

      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
        select: { quantity: true, receivedQty: true },
      });
      const fullyReceived = updatedItems.every(
        (i) => Number(i.receivedQty) >= Number(i.quantity),
      );
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          poStatus: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
          updatedById: ctx.userId,
        },
      });

      return receipt;
    });

    audit(ctx, {
      action: "purchasing.po.receive",
      entityType: "GoodsReceipt",
      entityId: receipt.id,
      after: {
        poNumber: po.poNumber,
        lines: receiptLines.map((l) => ({ item: l.poItem.inventoryItemId, qty: l.qty })),
      },
    });
    return receipt;
  },
};
