"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generatePayrollAction } from "../actions/hr.actions";

interface Props {
  periodStart: string;
  periodEnd: string;
  onClose: () => void;
}

export function PayrollDialog({ periodStart, periodEnd, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState(periodStart);
  const [end, setEnd] = useState(periodEnd);

  const submit = () =>
    startTransition(async () => {
      const result = await generatePayrollAction({ periodStart: start, periodEnd: end });
      if (result.ok) {
        toast.success("Payroll run generated");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.periodEnd || result.error.message);
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate payroll</DialogTitle>
          <DialogDescription>
            Builds one draft entry per active employee from the attendance recorded in this period.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="p-start">Period start *</Label>
            <Input
              id="p-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-end">Period end *</Label>
            <Input id="p-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !start || !end}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
