"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, Loader2, Percent, Banknote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CustomerSelect } from "@/modules/customers/components/customer-select";
import { listDeliveryZonesAction } from "@/modules/delivery/actions/delivery.actions";
import { useCartStore, cartTotals } from "../store/cart.store";
import { placeOrderAction } from "../actions/order.actions";

export interface PosItem {
  id: string;
  name: string;
  categoryId: string;
  basePrice: number;
  taxRate: number;
  variants: { id: string; name: string; priceDelta: number }[];
}

interface Props {
  categories: { id: string; name: string }[];
  items: PosItem[];
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const ORDER_TYPES = [
  { value: "DINE_IN", label: "Dine-in" },
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DELIVERY", label: "Delivery" },
] as const;

interface DeliveryZoneOption {
  id: string;
  name: string;
  deliveryFee: number;
  minOrderAmount: number;
  etaMinutes: number;
}

export function PosScreen({ categories, items }: Props) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [zones, setZones] = useState<DeliveryZoneOption[]>([]);
  const [pending, startTransition] = useTransition();

  const cart = useCartStore();
  const totals = cartTotals(cart);
  const isDelivery = cart.orderType === "DELIVERY";

  // Zones are only needed once the till switches to delivery, and rarely change
  // during a shift — fetch on first switch and keep them.
  useEffect(() => {
    if (!isDelivery || zones.length > 0) return;
    let active = true;
    listDeliveryZonesAction().then((result) => {
      if (active && result.ok) setZones(result.data);
    });
    return () => {
      active = false;
    };
  }, [isDelivery, zones.length]);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (i) =>
          (!activeCategory || i.categoryId === activeCategory) &&
          (!search || i.name.toLowerCase().includes(search.toLowerCase())),
      ),
    [items, activeCategory, search],
  );

  const addItem = (item: PosItem, variantId?: string) => {
    const variant = variantId ? item.variants.find((v) => v.id === variantId) : null;
    cart.add({
      menuItemId: item.id,
      variantId: variant?.id ?? null,
      name: variant ? `${item.name} (${variant.name})` : item.name,
      unitPrice: item.basePrice + (variant?.priceDelta ?? 0),
      taxRate: item.taxRate,
    });
  };

  const applyDiscount = () => {
    const value = Number(discountPct);
    if (!value || value <= 0 || value > 100) {
      cart.setDiscount(null);
      return;
    }
    cart.setDiscount({ type: "PERCENTAGE", value });
  };

  const checkout = () =>
    startTransition(async () => {
      const result = await placeOrderAction({
        type: cart.orderType,
        customerId: cart.customerId,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          variantId: l.variantId,
          quantity: l.quantity,
          notes: l.notes ?? "",
        })),
        discount: cart.discount ? { ...cart.discount, label: "POS discount" } : null,
        tipAmount: cart.tipAmount,
        payment: { method: "CASH", amount: totals.total },
        notes: "",
        deliveryAddress: isDelivery ? cart.deliveryAddress : "",
        zoneId: isDelivery ? cart.zoneId : null,
      });
      if (result.ok) {
        toast.success(`Order ${result.data.orderNumber} placed — ${money.format(result.data.total)}`);
        cart.clear();
        setDiscountPct("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-4">
      {/* Item grid */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search menu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              !activeCategory ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                activeCategory === c.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-accent",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-4 sm:grid-cols-3 xl:grid-cols-4">
          {visibleItems.length === 0 && (
            <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
              No items match. Add menu items first.
            </p>
          )}
          {visibleItems.map((item) => (
            <div key={item.id} className="flex flex-col rounded-lg border p-3 transition-shadow hover:shadow-md">
              <button className="flex-1 text-left" onClick={() => addItem(item)}>
                <p className="font-medium leading-tight">{item.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{money.format(item.basePrice)}</p>
              </button>
              {item.variants.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => addItem(item, v.id)}
                      className="rounded border px-1.5 py-0.5 text-xs hover:bg-accent"
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Cart */}
      <aside className="flex w-80 shrink-0 flex-col rounded-lg border bg-card">
        <div className="flex gap-1 p-3 pb-2">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => cart.setOrderType(t.value)}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium",
                cart.orderType === t.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 px-3 pb-3">
          <CustomerSelect
            value={cart.customerId}
            onValueChange={cart.setCustomer}
            disabled={pending}
          />

          {isDelivery && (
            <>
              <Input
                placeholder="Delivery address"
                className="h-8 text-xs"
                value={cart.deliveryAddress}
                onChange={(e) => cart.setDeliveryAddress(e.target.value)}
              />
              <select
                aria-label="Delivery zone"
                className="h-8 w-full rounded-md border bg-transparent px-2 text-xs"
                value={cart.zoneId ?? ""}
                onChange={(e) => cart.setZone(e.target.value || null)}
              >
                <option value="">No zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} — {money.format(z.deliveryFee)}, ~{z.etaMinutes} min
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <Separator />

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {cart.lines.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">Cart is empty</p>
          )}
          {cart.lines.map((line) => (
            <div key={line.key} className="rounded-md border p-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{line.name}</p>
                <button
                  aria-label="Remove"
                  onClick={() => cart.remove(line.key)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline" size="icon" className="size-6" aria-label="Decrease"
                    onClick={() => cart.setQty(line.key, line.quantity - 1)}
                  >
                    <Minus className="size-3" />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                  <Button
                    variant="outline" size="icon" className="size-6" aria-label="Increase"
                    onClick={() => cart.setQty(line.key, line.quantity + 1)}
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
                <span className="text-sm tabular-nums">
                  {money.format(line.unitPrice * line.quantity)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <Separator />
        <div className="space-y-2 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Percent className="size-3.5 text-muted-foreground" />
            <Input
              placeholder="Discount %"
              type="number" min="0" max="100"
              className="h-8"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              onBlur={applyDiscount}
            />
            <Input
              placeholder="Tip"
              type="number" min="0" step="0.5"
              className="h-8 w-20"
              value={cart.tipAmount || ""}
              onChange={(e) => cart.setTip(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span><span className="tabular-nums">{money.format(totals.subtotal)}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span><span className="tabular-nums">-{money.format(totals.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Tax</span><span className="tabular-nums">{money.format(totals.taxAmount)}</span>
          </div>
          {cart.tipAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Tip</span><span className="tabular-nums">{money.format(cart.tipAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span><span className="tabular-nums">{money.format(totals.total)}</span>
          </div>
          {isDelivery && cart.deliveryAddress.trim().length < 5 && (
            <p className="text-xs text-muted-foreground">
              Enter a delivery address to charge this order.
            </p>
          )}
          <Button
            className="w-full"
            size="lg"
            disabled={
              cart.lines.length === 0 ||
              pending ||
              (isDelivery && cart.deliveryAddress.trim().length < 5)
            }
            onClick={checkout}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
            Charge {money.format(totals.total)}
          </Button>
        </div>
      </aside>
    </div>
  );
}
