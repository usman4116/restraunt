# RBAC Permission Matrix

Permissions are `resource:action` strings. Roles map to permission sets; organizations can clone a role and customize (custom roles stored per-org). Enforcement: `requirePermission(ctx, "orders:refund")` in every action/route.

## Resources & actions

`dashboard, orders, pos, kds, menu, inventory, recipes, purchasing, suppliers, customers, loyalty, reservations, delivery, employees, attendance, payroll, finance, reports, settings, users, audit`
Actions: `view, create, update, delete, approve, export, refund, void, manage` (manage = full control incl. settings for that resource).

## Role → permission summary

| Role | Grants |
|---|---|
| **Super Admin** | Platform-level: all orgs, plans, impersonation, `*:*` (platform scope only) |
| **Organization Owner** | `*:*` within own org |
| **Restaurant Manager** | All org resources view/create/update; approve; refund/void; no `users:manage`, no `finance:manage` |
| **Branch Manager** | Same as Restaurant Manager but scoped to assigned branch(es) |
| **Cashier** | `pos:*`, `orders:view/create/update`, `customers:view/create`, `orders:refund` **only with manager PIN approval** |
| **Waiter** | `pos:view/create/update` (own tables), `orders:view/create/update`, `reservations:view/update`, `menu:view` |
| **Kitchen Manager** | `kds:manage`, `recipes:manage`, `inventory:view`, `orders:view`, `menu:view` |
| **Chef** | `kds:view/update`, `recipes:view`, `orders:view` |
| **Kitchen Staff** | `kds:view/update` |
| **Inventory Manager** | `inventory:manage`, `recipes:view`, `purchasing:view/create`, `suppliers:view`, `reports:view/export` (inventory) |
| **Purchasing Officer** | `purchasing:manage`, `suppliers:manage`, `inventory:view` |
| **HR Manager** | `employees:manage`, `attendance:manage`, `payroll:manage`, `reports:view/export` (HR) |
| **Accountant** | `finance:manage`, `reports:view/export`, `orders:view`, `purchasing:view` |
| **Delivery Rider** | `delivery:view/update` (own assignments only) |
| **Customer** | Customer portal: own profile, own orders, reservations, loyalty |
| **Guest** | Public menu, QR ordering, guest checkout |
| **Auditor** | `*:view` + `audit:view` + `reports:export` — strictly read-only |

## Enforcement points

1. **Proxy** (`src/proxy.ts`, the Next 16 replacement for the deprecated `middleware` convention) — session check, org resolution, route-group gating (`/admin`, `/pos`, `/kds`, `/portal`).
2. **Server actions / API routes** — `requirePermission()` before any service call (source of truth).
3. **UI** — `<Can permission="...">` component hides affordances (UX only, never security).
4. **Database** — RLS as backstop for org isolation.

## Sensitive operations requiring elevated check

Refunds & voids above threshold (manager PIN), payroll approval, journal posting, user role changes, data export of PII — all write additionally to `audit_logs` with before/after snapshot.
