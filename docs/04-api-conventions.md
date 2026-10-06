# API Conventions

Base path: `/api/v1`. Server actions are the primary write path for the first-party UI; REST routes exist for integrations, mobile, and third parties — both are thin wrappers over the same services.

## Request/response envelope

```jsonc
// success
{ "ok": true, "data": { ... }, "meta": { "page": 1, "pageSize": 25, "total": 312 } }
// failure
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "name": "Required" } } }
```

Error codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL` (500).

## Collection endpoints

`GET /api/v1/menu/items?page=1&pageSize=25&sort=-createdAt&search=burger&filter[categoryId]=…&filter[status]=ACTIVE`

- Pagination: `page`/`pageSize` (max 100), always returns `meta.total`.
- Sorting: `sort=field` asc, `-field` desc; whitelist per resource.
- Search: `search=` full-text where supported (Postgres FTS), ilike fallback.
- Filtering: `filter[field]=value`, validated per-resource by Zod.
- Bulk: `POST …/bulk-update`, `POST …/bulk-delete` with `{ ids: [], patch: {} }`.
- Export: `GET …/export?format=csv|xlsx|pdf` → queued for large sets, direct stream for small.
- Import: `POST …/import` multipart CSV with dry-run mode (`?dryRun=1`).

## Auth

`Authorization: Bearer <access JWT>` (15 min) + `POST /api/v1/auth/refresh` with httpOnly refresh cookie (30 d, rotating). First-party UI uses httpOnly session cookies. All mutating REST calls require `X-Idempotency-Key` on payment/order endpoints.

## Versioning & docs

Breaking changes → `/api/v2`. OpenAPI 3.1 spec generated from Zod DTOs (`npm run openapi`), served at `/api/v1/docs`.
