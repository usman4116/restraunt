"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSectionAction, createTableAction } from "../actions/reservation.actions";
import type { FloorSectionRow } from "./floor-plan";

interface Props {
  open: boolean;
  sections: FloorSectionRow[];
  onClose: () => void;
}

export function TableDialog({ open, sections, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sectionName, setSectionName] = useState("");
  const [tableName, setTableName] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");

  const addSection = () =>
    startTransition(async () => {
      const result = await createSectionAction({ name: sectionName, sortOrder: sections.length });
      if (result.ok) {
        toast.success("Section added");
        setSectionName("");
        setSectionId(result.data.id);
        router.refresh();
      } else toast.error(result.error.fields?.name ?? result.error.message);
    });

  const addTable = () =>
    startTransition(async () => {
      const result = await createTableAction({
        sectionId,
        name: tableName,
        capacity: Number(capacity),
      });
      if (result.ok) {
        toast.success("Table added");
        setTableName("");
        router.refresh();
      } else toast.error(result.error.fields?.name ?? result.error.message);
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Floor sections &amp; tables</DialogTitle>
          <DialogDescription>
            Sections group tables (main hall, terrace). Tables need a unique name per branch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm font-medium">Add a section</p>
          <div className="flex gap-2">
            <Input
              placeholder="Terrace"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={pending || !sectionName.trim()}
              onClick={addSection}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-sm font-medium">Add a table</p>
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a section first.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="t-section">Section</Label>
                <Select value={sectionId} onValueChange={(value) => setSectionId(value ?? "")}>
                  <SelectTrigger id="t-section">
                    <SelectValue placeholder="Pick a section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="t-name">Name</Label>
                  <Input
                    id="t-name"
                    placeholder="T1"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-cap">Seats</Label>
                  <Input
                    id="t-cap"
                    type="number"
                    min="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={pending || !tableName.trim() || !sectionId}
                onClick={addTable}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Add table
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
