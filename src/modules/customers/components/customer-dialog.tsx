"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createCustomerAction, updateCustomerAction } from "../actions/customer.actions";

export interface CustomerRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  loyaltyPoints: number;
  loyaltyTier: string;
  totalSpent: number;
  visitCount: number;
  marketingOptIn: boolean;
}

interface Props {
  open: boolean;
  customer?: CustomerRow;
  onClose: () => void;
}

export function CustomerDialog({ open, customer, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
        </DialogHeader>
        {open && <CustomerForm customer={customer} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ customer, onClose }: { customer?: CustomerRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  useEffect(() => {
    if (customer) {
      setFirstName(customer.firstName);
      setLastName(customer.lastName || "");
      setEmail(customer.email || "");
      setPhone(customer.phone || "");
      setBirthday(customer.birthday || "");
      setAddress(customer.address || "");
      setNotes(customer.notes || "");
      setTags(customer.tags);
      setMarketingOptIn(customer.marketingOptIn);
    }
  }, [customer]);

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 12) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const submit = () =>
    startTransition(async () => {
      const input = {
        firstName,
        lastName,
        email,
        phone,
        birthday,
        address,
        notes,
        tags,
        marketingOptIn,
      };
      const result = customer
        ? await updateCustomerAction(customer.id, input)
        : await createCustomerAction(input);
      if (result.ok) {
        toast.success(customer ? "Customer updated" : "Customer created");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.firstName || result.error.message);
      }
    });

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="c-first">First name *</Label>
            <Input
              id="c-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-last">Last name</Label>
            <Input id="c-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-email">Email</Label>
          <Input
            id="c-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-phone">Phone</Label>
          <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-birthday">Birthday</Label>
          <Input
            id="c-birthday"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-address">Address</Label>
          <Input id="c-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-notes">Notes</Label>
          <Textarea
            id="c-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-tag-input">Tags</Label>
          <div className="flex gap-2">
            <Input
              id="c-tag-input"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            />
            <Button type="button" size="sm" onClick={addTag} disabled={!tagInput.trim()}>
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pl-2 pr-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="rounded-sm hover:bg-accent"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <Label htmlFor="c-marketing" className="cursor-pointer">
            Marketing opt-in
          </Label>
          <Switch
            id="c-marketing"
            checked={marketingOptIn}
            onCheckedChange={setMarketingOptIn}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !firstName.trim()}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {customer ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </>
  );
}
