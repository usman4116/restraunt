"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setTableStatusAction } from "../actions/reservation.actions";

export interface FloorTable {
  id: string;
  name: string;
  capacity: number;
  tableStatus: string;
}

export interface FloorSectionRow {
  id: string;
  name: string;
  tables: FloorTable[];
}

const STATUSES = ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "OUT_OF_SERVICE"] as const;

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  OCCUPIED: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  RESERVED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500",
  CLEANING: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  OUT_OF_SERVICE: "border-muted bg-muted text-muted-foreground",
};

export function FloorPlan({ sections }: { sections: FloorSectionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeStatus = (tableId: string, tableStatus: string) =>
    startTransition(async () => {
      const result = await setTableStatusAction({ tableId, tableStatus });
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });

  if (sections.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No floor sections yet. Add a section and tables to see the floor plan.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Card key={section.id} className="gap-0 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{section.name}</h3>
            <span className="text-xs text-muted-foreground">
              {section.tables.length} table{section.tables.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {section.tables.length === 0 && (
              <p className="text-sm text-muted-foreground">No tables in this section.</p>
            )}
            {section.tables.map((table) => (
              <DropdownMenu key={table.id}>
                <DropdownMenuTrigger
                  disabled={pending}
                  className={cn(
                    "flex size-20 flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-xs font-medium transition-transform hover:scale-105 disabled:opacity-60",
                    STATUS_STYLES[table.tableStatus] ?? "bg-muted",
                  )}
                  aria-label={`Table ${table.name}, ${table.tableStatus.toLowerCase()}`}
                >
                  <span className="text-sm font-semibold">{table.name}</span>
                  <span className="flex items-center gap-1 opacity-80">
                    <Users className="size-3" aria-hidden /> {table.capacity}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide opacity-70">
                    {table.tableStatus.replace(/_/g, " ")}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUSES.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      disabled={status === table.tableStatus}
                      onClick={() => changeStatus(table.id, status)}
                    >
                      {status.replace(/_/g, " ").toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
