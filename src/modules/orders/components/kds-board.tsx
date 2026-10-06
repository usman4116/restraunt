"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, CheckCheck, Bell, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  listKdsTicketsAction,
  updateTicketStatusAction,
  type KdsTicket,
} from "../actions/order.actions";

const COLUMNS = [
  { status: "NEW", title: "New", icon: Bell, accent: "border-t-blue-500" },
  { status: "COOKING", title: "Cooking", icon: Flame, accent: "border-t-amber-500" },
  { status: "READY", title: "Ready", icon: CheckCheck, accent: "border-t-emerald-500" },
] as const;

const NEXT_STATUS: Record<string, { label: string; status: "COOKING" | "READY" | "COMPLETED" }> = {
  NEW: { label: "Start cooking", status: "COOKING" },
  COOKING: { label: "Mark ready", status: "READY" },
  READY: { label: "Complete", status: "COMPLETED" },
};

function elapsedMinutes(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function KdsBoard() {
  const queryClient = useQueryClient();

  const { data: tickets = [], isError } = useQuery({
    queryKey: ["kds-tickets"],
    queryFn: async () => {
      const result = await listKdsTicketsAction();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    refetchInterval: 5_000,
  });

  const advance = async (ticket: KdsTicket) => {
    const next = NEXT_STATUS[ticket.status];
    if (!next) return;
    const result = await updateTicketStatusAction({ ticketId: ticket.id, status: next.status });
    if (result.ok) {
      queryClient.invalidateQueries({ queryKey: ["kds-tickets"] });
    } else {
      toast.error(result.error.message);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kitchen Display</h1>
        <p className="text-sm text-muted-foreground">
          Auto-refreshes every 5 seconds{isError && " — connection problem, retrying"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnTickets = tickets.filter((t) => t.status === column.status);
          return (
            <section key={column.status} className="space-y-3">
              <header className="flex items-center gap-2 text-sm font-medium">
                <column.icon className="size-4" />
                {column.title}
                <Badge variant="secondary">{columnTickets.length}</Badge>
              </header>
              {columnTickets.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Empty
                </p>
              )}
              {columnTickets.map((ticket) => {
                const minutes = elapsedMinutes(ticket.createdAt);
                const delayed = minutes >= 15 && ticket.status !== "READY";
                return (
                  <article
                    key={ticket.id}
                    className={cn("rounded-lg border border-t-4 bg-card p-3 shadow-sm", column.accent)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{ticket.orderNumber}</p>
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs tabular-nums",
                          delayed ? "font-semibold text-destructive" : "text-muted-foreground",
                        )}
                      >
                        <Clock className="size-3" /> {minutes}m
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ticket.orderType.replace("_", " ")}
                      {ticket.tableName && ` · Table ${ticket.tableName}`}
                      {" · "}{ticket.ticketNumber}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {ticket.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-2">
                          <span>{item.name}</span>
                          <span className="tabular-nums text-muted-foreground">×{item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    {ticket.notes && (
                      <p className="mt-2 rounded bg-muted p-1.5 text-xs">{ticket.notes}</p>
                    )}
                    <Button size="sm" className="mt-3 w-full" onClick={() => advance(ticket)}>
                      {NEXT_STATUS[ticket.status]?.label}
                    </Button>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
