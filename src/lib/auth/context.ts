// Tenant context + authorization guards. Every server action / API route calls
// requireAuth() or requirePermission() before touching a service.
import { DomainError } from "@/lib/result";
import { hasPermission, type Permission } from "@/lib/rbac";
import { getSession, type SessionClaims } from "./session";

export interface TenantContext {
  userId: string;
  organizationId: string;
  branchId: string | null;
  permissions: string[];
}

export async function requireAuth(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) throw new DomainError("UNAUTHENTICATED", "You must be signed in.");
  return session;
}

export async function requireTenant(): Promise<TenantContext> {
  const session = await requireAuth();
  if (!session.organizationId) {
    throw new DomainError("FORBIDDEN", "No organization selected.");
  }
  return {
    userId: session.userId,
    organizationId: session.organizationId,
    branchId: session.branchId,
    permissions: session.permissions,
  };
}

export async function requirePermission(permission: Permission): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (!hasPermission(ctx.permissions, permission)) {
    throw new DomainError("FORBIDDEN", `Missing permission: ${permission}`);
  }
  return ctx;
}

/** Scope helper — spread into every Prisma `where` for tenant-owned tables. */
export const tenantWhere = (ctx: TenantContext) => ({
  organizationId: ctx.organizationId,
  deletedAt: null,
});

export const branchWhere = (ctx: TenantContext) => ({
  ...tenantWhere(ctx),
  ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
});

/**
 * Same scope for tables that carry no `deletedAt` — child rows and ledger
 * records (deliveries, stock movements, attendance, payroll runs) that are
 * hard-deleted with their parent. Spreading tenantWhere() into one of these is
 * a Prisma validation error at request time, and TypeScript cannot catch it
 * because excess-property checks do not apply to spreads.
 */
export const orgWhere = (ctx: TenantContext) => ({
  organizationId: ctx.organizationId,
});

export const orgBranchWhere = (ctx: TenantContext) => ({
  ...orgWhere(ctx),
  ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
});
