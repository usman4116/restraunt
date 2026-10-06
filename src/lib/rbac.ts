import type { SystemRole } from "@/generated/prisma/client";

export const RESOURCES = [
  "dashboard",
  "orders",
  "pos",
  "kds",
  "menu",
  "inventory",
  "recipes",
  "purchasing",
  "suppliers",
  "customers",
  "loyalty",
  "reservations",
  "delivery",
  "employees",
  "attendance",
  "payroll",
  "finance",
  "reports",
  "settings",
  "users",
  "audit",
] as const;

export const ACTIONS = [
  "view",
  "create",
  "update",
  "delete",
  "approve",
  "export",
  "refund",
  "void",
  "manage",
] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];
export type Permission = `${Resource}:${Action}` | `${Resource}:*` | "*:*";

const p = (...perms: Permission[]) => perms;

/** Default permission sets per system role. Org-defined custom roles extend these. */
export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  SUPER_ADMIN: p("*:*"),
  ORG_OWNER: p("*:*"),
  RESTAURANT_MANAGER: p(
    "dashboard:*", "orders:*", "pos:*", "kds:*", "menu:*", "inventory:*",
    "recipes:*", "purchasing:*", "suppliers:*", "customers:*", "loyalty:*",
    "reservations:*", "delivery:*", "employees:view", "attendance:*",
    "reports:*", "settings:view", "users:*", "audit:view",
  ),
  BRANCH_MANAGER: p(
    "dashboard:*", "orders:*", "pos:*", "kds:*", "menu:view", "menu:update",
    "inventory:*", "recipes:view", "purchasing:view", "purchasing:create",
    "customers:*", "loyalty:view", "reservations:*", "delivery:*",
    "attendance:*", "reports:view", "reports:export",
  ),
  CASHIER: p(
    "pos:*", "orders:view", "orders:create", "orders:update",
    "customers:view", "customers:create", "menu:view",
  ),
  WAITER: p(
    "pos:view", "pos:create", "pos:update", "orders:view", "orders:create",
    "orders:update", "reservations:view", "reservations:update", "menu:view",
  ),
  KITCHEN_MANAGER: p("kds:*", "recipes:*", "inventory:view", "orders:view", "menu:view"),
  CHEF: p("kds:view", "kds:update", "recipes:view", "orders:view"),
  KITCHEN_STAFF: p("kds:view", "kds:update"),
  INVENTORY_MANAGER: p(
    "inventory:*", "recipes:view", "purchasing:view", "purchasing:create",
    "suppliers:view", "reports:view", "reports:export",
  ),
  PURCHASING_OFFICER: p("purchasing:*", "suppliers:*", "inventory:view"),
  HR_MANAGER: p("employees:*", "attendance:*", "payroll:*", "reports:view", "reports:export"),
  ACCOUNTANT: p("finance:*", "reports:*", "orders:view", "purchasing:view"),
  DELIVERY_RIDER: p("delivery:view", "delivery:update"),
  CUSTOMER: p(),
  AUDITOR: p(
    ...RESOURCES.map((r) => `${r}:view` as Permission),
    "reports:export", "audit:view",
  ),
};

export function hasPermission(granted: string[], required: Permission): boolean {
  if (granted.includes("*:*")) return true;
  if (granted.includes(required)) return true;
  const [resource] = required.split(":");
  return granted.includes(`${resource}:*`);
}

export function permissionsForRole(role: SystemRole, extra: string[] = []): string[] {
  return [...new Set([...ROLE_PERMISSIONS[role], ...extra])];
}
