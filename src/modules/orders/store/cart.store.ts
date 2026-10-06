import { create } from "zustand";

export interface CartLine {
  key: string; // menuItemId:variantId
  menuItemId: string;
  variantId: string | null;
  name: string;
  unitPrice: number;
  taxRate: number;
  quantity: number;
  notes?: string;
}

interface CartState {
  lines: CartLine[];
  orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  discount: { type: "PERCENTAGE" | "FIXED_AMOUNT"; value: number } | null;
  tipAmount: number;
  customerId: string | null;
  deliveryAddress: string;
  zoneId: string | null;
  add(line: Omit<CartLine, "key" | "quantity">): void;
  setQty(key: string, quantity: number): void;
  remove(key: string): void;
  setOrderType(type: CartState["orderType"]): void;
  setDiscount(discount: CartState["discount"]): void;
  setTip(amount: number): void;
  setCustomer(customerId: string | null): void;
  setDeliveryAddress(address: string): void;
  setZone(zoneId: string | null): void;
  clear(): void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  orderType: "DINE_IN",
  discount: null,
  tipAmount: 0,
  customerId: null,
  deliveryAddress: "",
  zoneId: null,

  add: (line) =>
    set((state) => {
      const key = `${line.menuItemId}:${line.variantId ?? "base"}`;
      const existing = state.lines.find((l) => l.key === key);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.key === key ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        };
      }
      return { lines: [...state.lines, { ...line, key, quantity: 1 }] };
    }),

  setQty: (key, quantity) =>
    set((state) => ({
      lines:
        quantity <= 0
          ? state.lines.filter((l) => l.key !== key)
          : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
    })),

  remove: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),
  setOrderType: (orderType) => set({ orderType }),
  setDiscount: (discount) => set({ discount }),
  setTip: (tipAmount) => set({ tipAmount }),
  setCustomer: (customerId) => set({ customerId }),
  setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
  setZone: (zoneId) => set({ zoneId }),
  // Reset every per-order field, orderType included: the next customer at the
  // till is not implicitly a delivery just because the last one was.
  clear: () =>
    set({
      lines: [],
      orderType: "DINE_IN",
      discount: null,
      tipAmount: 0,
      customerId: null,
      deliveryAddress: "",
      zoneId: null,
    }),
}));

export function cartTotals(state: Pick<CartState, "lines" | "discount" | "tipAmount">) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = round2(state.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const discountAmount = state.discount
    ? state.discount.type === "PERCENTAGE"
      ? round2((subtotal * state.discount.value) / 100)
      : round2(Math.min(state.discount.value, subtotal))
    : 0;
  const taxableBase = subtotal - discountAmount;
  const taxAmount = round2(
    state.lines.reduce((sum, l) => {
      const lineTotal = l.unitPrice * l.quantity;
      const share = subtotal > 0 ? lineTotal / subtotal : 0;
      return sum + taxableBase * share * (l.taxRate / 100);
    }, 0),
  );
  const total = round2(taxableBase + taxAmount + state.tipAmount);
  return { subtotal, discountAmount, taxAmount, total };
}
