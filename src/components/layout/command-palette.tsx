"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const DESTINATIONS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "POS", href: "/pos" },
  { label: "Kitchen Display", href: "/kds" },
  { label: "Menu", href: "/menu" },
  { label: "Inventory", href: "/inventory" },
  { label: "Recipes", href: "/recipes" },
  { label: "Purchasing", href: "/purchasing" },
  { label: "Customers", href: "/customers" },
  { label: "Reservations", href: "/reservations" },
  { label: "Delivery", href: "/delivery" },
  { label: "HR", href: "/hr" },
  { label: "Finance", href: "/finance" },
  { label: "Reports", href: "/reports" },
  { label: "Settings", href: "/settings" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden items-center gap-2 text-muted-foreground md:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
        Search…
        <kbd className="rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Go to…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {DESTINATIONS.map((d) => (
              <CommandItem
                key={d.href}
                onSelect={() => {
                  setOpen(false);
                  router.push(d.href);
                }}
              >
                {d.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
