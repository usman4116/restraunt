# Restaurant ERP

Multi-tenant restaurant ERP SaaS — POS, kitchen display, menu, inventory, CRM, HR, and finance on a single platform.

**Stack:** Next.js (App Router) · React 19 · TypeScript · Tailwind + shadcn/ui · Prisma 7 · PostgreSQL 16 · TanStack Query · Zustand · Zod

## Quick start (local, no Docker)

Requires Node 22+ and a local PostgreSQL 16.

```bash
# 1. One-time database bootstrap (needs postgres superuser)
sudo -u postgres psql -c "CREATE USER erp WITH PASSWORD 'erp' CREATEDB;" \
                      -c "CREATE DATABASE restaurant_erp OWNER erp;"

# 2. Configure & install
cp .env.example .env
npm install

# 3. Migrate + seed demo restaurant
npx prisma migrate dev
npm run db:seed

# 4. Run
npm run dev
```

Sign in at http://localhost:3000 with the seeded demo accounts (all use password `Demo1234pass`):

| Email | Role |
|---|---|
| `owner@demo.rest` | Organization Owner |
| `manager@demo.rest` | Restaurant Manager |
| `cashier@demo.rest` | Cashier |
| `chef@demo.rest` | Chef (KDS only) |

Or register a fresh organization at `/register`.

## What's implemented

- **Auth & multi-tenancy** — org registration, credential login, JWT sessions with server-side revocation, rate limiting, login history, audit log. Every query is org-scoped at the repository layer. Edge gating lives in `src/proxy.ts` (Next 16 renamed the `middleware` convention to `proxy`).
- **RBAC** — 16 roles with a `resource:action` permission matrix (`src/lib/rbac.ts`), enforced in every server action.
- **Dashboard** — live KPIs (revenue, orders, AOV, kitchen queue, low stock, reservations) + 7-day sales chart, cached 60 s.
- **Menu management** — categories, items, variants, allergens, tax rates; searchable paginated table.
- **POS** — item grid with category filter/search, cart (Zustand), percentage discounts, tips, server-side pricing (client prices are never trusted), cash payment, automatic kitchen ticket dispatch.
- **Kitchen Display** — three-column live board (New → Cooking → Ready), 5 s polling, elapsed-time and delay indicators, order status sync.
- **Inventory & purchasing** — items, stock levels, reorder points, suppliers, purchase orders, goods receipt, stock movements, wastage.
- **CRM** — customers, contact/address book, loyalty points and tiers, order history, segments.
- **Reservations** — tables and floor areas, availability search, booking lifecycle (pending → seated → completed), walk-ins, no-show tracking.
- **Delivery** — zones with fees and minimums, riders, dispatch assignment, delivery status timeline, per-rider load.
- **HR** — employees, shifts and rosters, attendance clock-in/out, leave requests, payroll runs with per-employee entries.
- **Finance** — chart of accounts, journal entries with double-entry balance validation, expenses, P&L and balance-sheet summaries.
- **Reports** — sales (day/week/month buckets), products, inventory, food cost, tax, payroll and customer reports, each exportable to CSV, Excel (SpreadsheetML) and PDF with no external dependencies.
- **Settings** — organization profile, branches, users, custom roles with a full permission grid, and a searchable audit trail.
- **Infrastructure** — Zod-validated env, Redis-optional cache layer (in-memory fallback in dev), health endpoint, Vitest unit tests, GitHub Actions CI.

Not yet built: FR-15 AI features (sales forecasting, demand prediction, natural-language report queries, daily insights digest), and the invoicing / bank-account / cash-flow slice of FR-13 — neither has database models in `prisma/schema.prisma` yet. See `docs/` for the specification and roadmap.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Vitest unit tests |
| `npm run db:migrate` | Prisma migrations (dev) |
| `npm run db:seed` | Seed demo restaurant |
| `npm run db:studio` | Prisma Studio |

## Documentation

- `docs/01-srs.md` — requirements specification
- `docs/02-architecture.md` — system & module architecture
- `docs/03-er-diagram.md` — ER diagram and data design decisions
- `docs/04-api-conventions.md` — API envelope, pagination, errors
- `docs/05-rbac-matrix.md` — role/permission matrix
- `docs/06-operations.md` — testing, deployment, checklist, roadmap
