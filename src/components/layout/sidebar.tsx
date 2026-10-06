"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  ChefHat,
  UtensilsCrossed,
  Package,
  BookOpen,
  Truck,
  Users,
  CalendarDays,
  Bike,
  Briefcase,
  Landmark,
  BarChart3,
  Settings,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const NAV = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", title: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operations",
    items: [
      { href: "/pos", title: "POS", icon: ShoppingCart },
      { href: "/orders", title: "Order History", icon: ClipboardList },
      { href: "/kds", title: "Kitchen Display", icon: ChefHat },
      { href: "/menu", title: "Menu", icon: UtensilsCrossed },
      { href: "/reservations", title: "Reservations", icon: CalendarDays },
      { href: "/delivery", title: "Delivery", icon: Bike },
    ],
  },
  {
    label: "Supply chain",
    items: [
      { href: "/inventory", title: "Inventory", icon: Package },
      { href: "/recipes", title: "Recipes", icon: BookOpen },
      { href: "/purchasing", title: "Purchasing", icon: Truck },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/customers", title: "Customers", icon: Users },
      { href: "/hr", title: "HR", icon: Briefcase },
      { href: "/finance", title: "Finance", icon: Landmark },
      { href: "/reports", title: "Reports", icon: BarChart3 },
      { href: "/audit", title: "Audit Log", icon: ShieldCheck },
      { href: "/settings", title: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar lg:block">
      <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <UtensilsCrossed className="size-4" />
        </span>
        Restaurant ERP
      </div>
      <ScrollArea className="h-[calc(100vh-3.5rem)] px-3 py-4">
        <nav className="space-y-6">
          {NAV.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <item.icon className="size-4" />
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
