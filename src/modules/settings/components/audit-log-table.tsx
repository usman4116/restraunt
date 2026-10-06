"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  createdAt: string;
}

const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/**
 * Read-only audit trail. Filtering is client-side over the rows the page already
 * loaded — the trail is capped at 200 entries, so a round trip buys nothing.
 */
export function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) =>
      [e.action, e.entityType, e.actor].some((field) => field.toLowerCase().includes(needle)),
    );
  }, [entries, filter]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Filter by action, entity or actor…"
        className="max-w-sm"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {entries.length === 0 ? "No audit entries yet." : "No entries match that filter."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {dateTime.format(new Date(entry.createdAt))}
                </TableCell>
                <TableCell>{entry.actor}</TableCell>
                <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.entityType}
                  {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}…` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
