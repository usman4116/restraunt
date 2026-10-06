"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import { placeOrderSchema, ticketStatusSchema, type OrderHistoryQuery } from "../dto/order.dto";
import {
  placeOrder,
  listKitchenTickets,
  updateTicketStatus,
  listOrderHistory,
} from "../service/order.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function placeOrderAction(
  raw: unknown,
): Promise<Result<{ id: string; orderNumber: string; total: number }>> {
  const parsed = placeOrderSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid order.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("pos:create");
    const order = await placeOrder(ctx, parsed.data);
    revalidatePath("/pos");
    revalidatePath("/kds");
    revalidatePath("/dashboard");
    if (parsed.data.type === "DELIVERY") revalidatePath("/delivery");
    revalidatePath("/finance");
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.totalAmount),
    };
  });
}

export interface KdsTicket {
  id: string;
  ticketNumber: string;
  status: string;
  priority: boolean;
  createdAt: string;
  orderNumber: string;
  orderType: string;
  tableName: string | null;
  notes: string | null;
  items: { id: string; name: string; quantity: number; notes: string | null }[];
}

export async function listKdsTicketsAction(): Promise<Result<KdsTicket[]>> {
  return guard(async () => {
    const ctx = await requirePermission("kds:view");
    const tickets = await listKitchenTickets(ctx);
    return tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      status: t.ticketStatus,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      orderNumber: t.order.orderNumber,
      orderType: t.order.type,
      tableName: t.order.table?.name ?? null,
      notes: t.order.notes,
      items: t.items.map((i) => ({
        id: i.id,
        name: i.nameSnapshot,
        quantity: Number(i.quantity),
        notes: i.notes,
      })),
    }));
  });
}

export async function updateTicketStatusAction(raw: unknown): Promise<Result<null>> {
  const parsed = ticketStatusSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("kds:update");
    await updateTicketStatus(ctx, parsed.data.ticketId, parsed.data.status);
    revalidatePath("/kds");
    return null;
  });
}

export async function listOrderHistoryAction(
  query: OrderHistoryQuery,
): Promise<Result<Awaited<ReturnType<typeof listOrderHistory>>>> {
  return guard(async () => {
    const ctx = await requirePermission("orders:view");
    return listOrderHistory(ctx, query);
  });
}
