# Software Requirements Specification — Restaurant ERP SaaS

**Version:** 1.0 · **Date:** 2026-08-02 · **Status:** Living document

## 1. Purpose

A multi-tenant Restaurant ERP SaaS serving operators from a single branch to franchises with hundreds of locations. Feature parity target: Toast POS, Square for Restaurants, Lightspeed, Foodics, Petpooja.

## 2. Scope

| Domain | Modules |
|---|---|
| Front of house | POS, table service, reservations, QR ordering, customer display |
| Back of house | Kitchen Display System, recipes, prep, ingredient alerts |
| Supply chain | Inventory, warehouses, purchasing, suppliers, stock ledger |
| Customer | CRM, loyalty, online ordering, delivery tracking, feedback |
| Workforce | HR, attendance, shifts, payroll, performance |
| Money | Finance (CoA, journals, P&L, balance sheet), taxes, invoicing |
| Intelligence | Executive dashboards, reports, AI forecasting & NL queries |

## 3. Actors & Roles

Super Admin, Organization Owner, Restaurant Manager, Branch Manager, Cashier, Waiter, Kitchen Manager, Chef, Kitchen Staff, Inventory Manager, Purchasing Officer, HR Manager, Accountant, Delivery Rider, Customer, Guest, Auditor. See `05-rbac-matrix.md`.

## 4. Functional Requirements (summary)

- **FR-1 Multi-tenancy** — Unlimited organizations; hard data isolation via `organization_id` scoping enforced at repository layer + PostgreSQL Row Level Security. Branch-level scoping within an org.
- **FR-2 Authentication** — Credential login, hashed passwords (bcrypt), Redis-backed sessions, JWT refresh tokens, device sessions, 2FA (TOTP), email verification, password reset, login history.
- **FR-3 POS** — Dine-in / takeaway / delivery orders; split & merge bills; discounts, coupons, gift cards, tips, multi-rate taxes; hold / void / refund / reopen; kitchen ticket dispatch; receipt generation; offline-tolerant order queue.
- **FR-4 KDS** — Real-time queue per station; status flow NEW → COOKING → READY → COMPLETED; priority & delay flags; chef assignment; timers.
- **FR-5 Menu** — Categories, products, variants, modifier groups, combos, allergens, nutrition, scheduling (happy hour / seasonal), branch-specific pricing & availability.
- **FR-6 Inventory** — Multi-warehouse stock, batch/expiry tracking, transfers, waste/spoilage, cycle counts, valuation (weighted average), immutable stock ledger.
- **FR-7 Recipes** — BOM per product; automatic ingredient consumption on order completion; food-cost calculation; versioning.
- **FR-8 Purchasing** — Supplier catalog, purchase requests → POs → receiving → supplier invoices → payments; returns; supplier performance metrics.
- **FR-9 CRM** — Customer profiles, order history, loyalty points, tiers, birthday offers, feedback/complaints, marketing segments.
- **FR-10 Reservations** — Floor layout, table management, bookings, waitlist, walk-ins.
- **FR-11 Delivery** — Rider profiles, zones, assignment, status tracking, OTP proof of delivery, earnings.
- **FR-12 HR** — Employee records, attendance, leave, shifts, payroll runs, documents.
- **FR-13 Finance** — Double-entry ledger: chart of accounts, journal entries, invoices, expenses, bank accounts, P&L, balance sheet, cash flow.
- **FR-14 Reporting** — Sales, product, inventory, food cost, tax, payroll, customer analytics; CSV/Excel/PDF export.
- **FR-15 AI** — Sales forecast, demand & inventory prediction, natural-language report queries, daily morning insights digest.

## 5. Non-Functional Requirements

| NFR | Target |
|---|---|
| Performance | P95 API < 300 ms; POS interactions < 100 ms perceived; dashboard cached via Redis |
| Scalability | Stateless app tier (horizontal), Postgres read replicas ready, queue workers scale independently |
| Availability | 99.9% target; health checks; graceful degradation of non-critical modules |
| Security | OWASP Top 10 mitigations, RLS, audit log on all mutations, rate limiting, encrypted secrets |
| Data isolation | No cross-org access possible at any layer (repo guard + RLS defence in depth) |
| Accessibility | WCAG 2.1 AA |
| Auditability | Every mutation records actor, timestamp, before/after diff |
| Maintainability | Feature-module clean architecture, ≥ 80% coverage on domain/service layers |

## 6. Constraints

- Stack: Next.js (App Router) + TypeScript, Prisma + PostgreSQL 16, Redis, BullMQ, S3-compatible storage.
- Money is stored as `Decimal(12,2)`; quantities as `Decimal(12,3)`. Never floats.
- All IDs are UUID v4. All timestamps UTC (`timestamptz`).
- Soft delete everywhere (`deleted_at`); hard delete only via data-retention jobs.

## 7. Acceptance

Each module ships with: Prisma models + migration, service layer with unit tests, server actions/API routes with validation, UI screens, seed data, and docs.
