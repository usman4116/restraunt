import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "critical";
}

const TONE = {
  default: "text-muted-foreground",
  warning: "text-amber-600 dark:text-amber-500",
  critical: "text-red-600 dark:text-red-500",
} as const;

export function StatTile({ label, value, hint, icon: Icon, tone = "default" }: StatTileProps) {
  return (
    <Card className="gap-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={cn("size-4 shrink-0", TONE[tone])} aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
