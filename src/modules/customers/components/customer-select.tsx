"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { listCustomersAction } from "../actions/customer.actions";

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyTier: string;
}

interface Props {
  value: string | null;
  onValueChange: (customerId: string | null) => void;
  disabled?: boolean;
}

/**
 * Searchable customer picker for the POS. Filtering happens server-side so a
 * large customer base does not have to be shipped to the till.
 */
export function CustomerSelect({ value, onValueChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [picked, setPicked] = useState<CustomerOption | null>(null);
  const [pending, startTransition] = useTransition();

  // Derived, not stored: the parent owns `value`, so clearing the cart clears
  // the label without an effect syncing the two.
  const label =
    value === null
      ? "Walk-in customer"
      : ((picked?.id === value ? picked.name : options.find((o) => o.id === value)?.name) ??
        "Customer selected");

  // Debounced fetch: the picker only queries while it is open.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await listCustomersAction(search);
        if (result.ok) setOptions(result.data);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [open, search]);

  const pick = (option: CustomerOption) => {
    const isSame = option.id === value;
    setPicked(isSame ? null : option);
    onValueChange(isSame ? null : option.id);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="h-8 min-w-0 flex-1 justify-between px-2 text-xs font-normal"
            />
          }
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <User className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search name, phone, email…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{pending ? "Searching…" : "No customers found."}</CommandEmpty>
              {options.map((option) => (
                <CommandItem key={option.id} value={option.id} onSelect={() => pick(option)}>
                  <Check
                    className={cn(
                      "size-4",
                      option.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{option.name}</span>
                    {(option.phone || option.email) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {option.phone ?? option.email}
                      </span>
                    )}
                  </span>
                  <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                    {option.loyaltyTier}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Clear customer"
          onClick={() => {
            setPicked(null);
            onValueChange(null);
          }}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
