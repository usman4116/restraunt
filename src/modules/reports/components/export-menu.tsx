"use client";

import { useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportReportAction } from "../actions/reports.actions";
import type { ExportFormat, ReportKind, SalesGranularity } from "../dto/reports.dto";

interface Props {
  kind: ReportKind;
  from: string;
  to: string;
  granularity: SalesGranularity;
}

const FORMAT_LABELS: { format: ExportFormat; label: string }[] = [
  { format: "csv", label: "CSV" },
  { format: "excel", label: "Excel" },
  { format: "pdf", label: "PDF" },
];

export function ExportMenu({ kind, from, to, granularity }: Props) {
  const [pending, startTransition] = useTransition();

  const download = (format: ExportFormat) =>
    startTransition(async () => {
      const result = await exportReportAction({ kind, format, from, to, granularity });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const { filename, mimeType, content } = result.data;
      const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}`);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FORMAT_LABELS.map(({ format, label }) => (
          <DropdownMenuItem key={format} onClick={() => download(format)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
