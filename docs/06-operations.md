# Operations: Testing, DevOps, Deployment, Roadmap

## Testing strategy

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| Unit | Vitest | domain + services (mocked repos) | ≥80% on services, every PR |
| Integration | Vitest + test Postgres (docker) | repositories, RLS isolation, migrations | every PR |
| E2E | Playwright | auth flow, POS order lifecycle, KDS flow | main branch |
| Security | ZAP baseline + npm audit | OWASP top 10 regressions | nightly |
| Performance | k6 | POS order create @ 200 rps, dashboard | pre-release |
| Accessibility | axe-core in Playwright | AA on all screens | main branch |

Critical invariant tests: cross-org isolation (attempt to read org B with org A ctx must fail at repo AND at RLS), journal entries always balance, stock ledger sums equal stock levels, order totals recompute identically.

## Local dev

Local development runs directly against the host's PostgreSQL 16 (no Docker). Redis is optional in dev — when `REDIS_URL` is empty, cache/session/queue layers fall back to in-memory implementations; jobs execute inline.

```bash
# one-time: create role + database (requires postgres superuser)
sudo -u postgres psql -c "CREATE USER erp WITH PASSWORD 'erp' CREATEDB;" \
                      -c "CREATE DATABASE restaurant_erp OWNER erp;"

cp .env.example .env
npm install
npx prisma migrate dev
npm run db:seed
npm run dev          # app on :3000
```

Docker remains supported for **production** deployment (see below); it is simply not used for local dev.

## Production deployment

- `Dockerfile` multi-stage (deps → build → distroless runner, non-root).
- `docker-compose.prod.yml`: app (N replicas) + worker + nginx (TLS, gzip, rate limit) + postgres + redis + minio; healthchecks on all services (`/api/health` checks DB, Redis, S3).
- CI (GitHub Actions): lint → typecheck → unit → integration (services in containers) → build → E2E → image push → deploy.
- Backups: nightly `pg_dump` to S3 + WAL archiving; restore drill documented.
- Monitoring: Prometheus scrape of `/api/metrics` (next-runtime + custom business metrics), Grafana dashboards, Loki for logs (pino JSON), alerting on error rate, queue depth, p95 latency.
- Env validation at boot via Zod (`src/lib/env.ts`) — app refuses to start with missing/invalid config.

## Production checklist

- [ ] All migrations applied, RLS policies verified against staging data
- [ ] Secrets in vault/env, none in repo; JWT + session secrets rotated
- [ ] Rate limits enabled; CORS locked to known origins; CSP headers on
- [ ] Backups verified restorable; monitoring alerts firing to on-call
- [ ] Seed/demo data absent from prod; superadmin bootstrap password rotated
- [ ] Load test passed; error budget dashboards live

## Roadmap (post-v1)

1. Native offline-first POS (Tauri/Capacitor wrapper, local queue sync)
2. WebSocket real-time (replace polling) for KDS/order tracking
3. Payment gateway integrations (Stripe, Adyen, local PSPs) behind a provider interface
4. Marketplace integrations (Uber Eats, Deliveroo) via channel manager
5. Franchise royalty management & consolidated multi-org reporting
6. ML-based dynamic pricing and staff scheduling optimization
7. Public developer API + webhooks + app marketplace
