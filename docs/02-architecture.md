# System Architecture

## High-level

```
┌────────────┐   ┌──────────────────────────────┐   ┌──────────────┐
│  Browser   │──▶│  Next.js (App Router)        │──▶│ PostgreSQL 16│
│  POS / KDS │   │  ├ Server Components (read)  │   │  + RLS       │
│  Back off. │   │  ├ Server Actions (write)    │   └──────────────┘
└────────────┘   │  ├ API Routes (/api/v1, REST)│   ┌──────────────┐
                 │  └ Proxy (auth, tenant)      │──▶│    Redis     │
                 └──────────────┬───────────────┘   │ cache/session│
                                │                   │ /rate-limit  │
                 ┌──────────────▼───────────────┐   └──────────────┘
                 │  BullMQ workers               │   ┌──────────────┐
                 │  email · notifications ·      │──▶│ S3 (MinIO)   │
                 │  reports · invoices · AI      │   └──────────────┘
                 └───────────────────────────────┘
```

## Layering (per feature module)

```
src/modules/<feature>/
├── domain/          # Entities, value objects, domain errors — pure TS, no I/O
├── dto/             # Zod schemas: input validation + output shapes
├── repository/      # Prisma data access — ALL queries tenant-scoped here
├── service/         # Business logic; orchestrates repos, emits events/jobs
├── actions/         # "use server" actions — auth + permission guard + DTO parse → service
├── api/             # Route handlers for REST /api/v1 (mirror of actions)
├── components/      # Feature UI (client + server components)
└── __tests__/
```

Rules:

1. **UI never imports Prisma.** Components call server actions or fetch API routes.
2. **Repositories are the only layer that touches Prisma**, and every method takes a `TenantContext` (`organizationId`, `branchId?`, `userId`) — queries without it don't compile.
3. **Services own transactions** (`prisma.$transaction`) and cross-module orchestration via events/queue jobs, never by importing another module's repository.
4. **Actions/API are thin**: authenticate → authorize (permission matrix) → validate (Zod DTO) → call service → map domain errors to typed results.
5. Shared kernel lives in `src/lib` (db, redis, auth, rbac, errors, result type) and `src/components/ui` (shadcn-style primitives).

## Multi-tenancy

- Every tenant-owned table has `organization_id` (+ `branch_id` where relevant), composite-indexed first.
- **Layer 1:** `TenantContext` injected into every repository call; a `tenantWhere()` helper makes it impossible to forget the scope.
- **Layer 2:** PostgreSQL RLS policies on tenant tables keyed off `current_setting('app.org_id')`, set per-transaction. Defence in depth — even a buggy query cannot cross orgs.
- Sessions carry `organizationId` + active `branchId`; branch switching re-issues session claims.

## Real-time

KDS and order status use short-interval polling with TanStack Query (`refetchInterval`) backed by Redis-cached queries; architecture allows swapping in SSE/WebSocket later without touching the service layer.

## Caching strategy

| Data | Store | TTL / invalidation |
|---|---|---|
| Sessions, device sessions | Redis | sliding 30 d |
| Dashboard KPIs | Redis | 60 s, invalidated on order close |
| Menu (per branch) | Redis | invalidate on menu mutation |
| Rate limits | Redis | fixed window |
| OTP / email verify tokens | Redis | 10 min |

## Error model

Services return `Result<T, DomainError>`; actions serialize to `{ ok: true, data } | { ok: false, error: { code, message, fields? } }`. API routes map the same errors to HTTP status codes. No raw exceptions cross the action boundary.

## Background jobs (BullMQ)

Queues: `email`, `sms`, `notification`, `invoice`, `report`, `ai-insights`, `inventory-consumption`. Workers run in a separate process (`src/workers/index.ts`), sharing service layer code.
