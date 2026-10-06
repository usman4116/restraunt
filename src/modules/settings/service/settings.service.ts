import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import { RESOURCES, ACTIONS } from "@/lib/rbac";
import type {
  OrganizationInput,
  BranchInput,
  CreateUserInput,
  UpdateUserInput,
  RoleInput,
  AuditQuery,
} from "../dto/settings.dto";

/**
 * Normalize a permission list: drop duplicates, and drop any `resource:action`
 * already implied by that resource's wildcard. Sorted for stable display/diffs.
 */
export function normalizePermissions(permissions: string[]): string[] {
  const set = new Set(permissions);
  const kept = [...set].filter((perm) => {
    const [resource, action] = perm.split(":");
    return action === "*" || !set.has(`${resource}:*`);
  });
  return kept.sort();
}

/** Every concrete permission the role grid can offer. */
export function allPermissions(): string[] {
  return RESOURCES.flatMap((resource) => ACTIONS.map((action) => `${resource}:${action}`));
}

/** The last ORG_OWNER cannot be demoted, deactivated or deleted — someone must own the org. */
export function isLastOwner(ownerCount: number, target: { systemRole: string }) {
  return target.systemRole === "ORG_OWNER" && ownerCount <= 1;
}

// ─────────────────────────────── organization ───────────────────────────────

async function organization(ctx: TenantContext) {
  const org = await prisma.organization.findFirst({
    where: { id: ctx.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      legalName: true,
      email: true,
      phone: true,
      logoUrl: true,
      currency: true,
      timezone: true,
      plan: true,
    },
  });
  if (!org) throw new DomainError("NOT_FOUND", "Organization not found.");
  return org;
}

async function updateOrganization(ctx: TenantContext, input: OrganizationInput) {
  const before = await organization(ctx);
  const updated = await prisma.organization.update({
    where: { id: ctx.organizationId },
    data: {
      name: input.name,
      legalName: input.legalName || null,
      email: input.email,
      phone: input.phone || null,
      currency: input.currency,
      timezone: input.timezone,
      logoUrl: input.logoUrl || null,
    },
  });
  audit(ctx, {
    action: "settings.organization.update",
    entityType: "Organization",
    entityId: ctx.organizationId,
    before,
    after: input,
  });
  return updated;
}

// ─────────────────────────────── branches ───────────────────────────────

async function branches(ctx: TenantContext) {
  const rows = await prisma.branch.findMany({
    where: tenantWhere(ctx),
    orderBy: { code: "asc" },
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    city: b.city,
    country: b.country,
    phone: b.phone,
    email: b.email,
    status: b.status,
  }));
}

async function createBranch(ctx: TenantContext, input: BranchInput) {
  const clash = await prisma.branch.findFirst({
    where: { ...tenantWhere(ctx), code: input.code },
    select: { id: true },
  });
  if (clash) {
    throw new DomainError("CONFLICT", "A branch with this code already exists.", {
      code: "Code already in use",
    });
  }
  const branch = await prisma.branch.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      code: input.code,
      address: input.address || null,
      city: input.city || null,
      country: input.country || null,
      phone: input.phone || null,
      email: input.email || null,
      createdById: ctx.userId,
    },
  });
  audit(ctx, {
    action: "settings.branch.create",
    entityType: "Branch",
    entityId: branch.id,
    after: input,
  });
  return branch;
}

async function updateBranch(ctx: TenantContext, id: string, input: BranchInput) {
  const existing = await prisma.branch.findFirst({ where: { ...tenantWhere(ctx), id } });
  if (!existing) throw new DomainError("NOT_FOUND", "Branch not found.");
  const clash = await prisma.branch.findFirst({
    where: { ...tenantWhere(ctx), code: input.code, id: { not: id } },
    select: { id: true },
  });
  if (clash) {
    throw new DomainError("CONFLICT", "A branch with this code already exists.", {
      code: "Code already in use",
    });
  }
  const branch = await prisma.branch.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      address: input.address || null,
      city: input.city || null,
      country: input.country || null,
      phone: input.phone || null,
      email: input.email || null,
      updatedById: ctx.userId,
    },
  });
  audit(ctx, {
    action: "settings.branch.update",
    entityType: "Branch",
    entityId: id,
    before: existing,
    after: input,
  });
  return branch;
}

async function removeBranch(ctx: TenantContext, id: string) {
  const existing = await prisma.branch.findFirst({ where: { ...tenantWhere(ctx), id } });
  if (!existing) throw new DomainError("NOT_FOUND", "Branch not found.");
  const total = await prisma.branch.count({ where: tenantWhere(ctx) });
  if (total <= 1) {
    throw new DomainError("CONFLICT", "An organization needs at least one branch.");
  }
  await prisma.branch.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: ctx.userId },
  });
  audit(ctx, {
    action: "settings.branch.delete",
    entityType: "Branch",
    entityId: id,
    before: existing,
  });
}

// ─────────────────────────────── users ───────────────────────────────

async function users(ctx: TenantContext) {
  const rows = await prisma.user.findMany({
    where: tenantWhere(ctx),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      systemRole: true,
      branchIds: true,
      status: true,
      lastLoginAt: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map((u) => ({
    ...u,
    fullName: `${u.firstName} ${u.lastName}`,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));
}

async function ownerCount(ctx: TenantContext) {
  return prisma.user.count({
    where: { ...tenantWhere(ctx), systemRole: "ORG_OWNER", status: "ACTIVE" },
  });
}

async function createUser(ctx: TenantContext, input: CreateUserInput) {
  const clash = await prisma.user.findFirst({
    where: { organizationId: ctx.organizationId, email: input.email, deletedAt: null },
    select: { id: true },
  });
  if (clash) {
    throw new DomainError("CONFLICT", "A user with this email already exists.", {
      email: "Email already in use",
    });
  }
  const user = await prisma.user.create({
    data: {
      organizationId: ctx.organizationId,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
      systemRole: input.systemRole,
      branchIds: input.branchIds,
      createdById: ctx.userId,
    },
  });
  audit(ctx, {
    action: "settings.user.create",
    entityType: "User",
    entityId: user.id,
    after: { email: input.email, systemRole: input.systemRole },
  });
  return user;
}

async function updateUser(ctx: TenantContext, id: string, input: UpdateUserInput) {
  const existing = await prisma.user.findFirst({ where: { ...tenantWhere(ctx), id } });
  if (!existing) throw new DomainError("NOT_FOUND", "User not found.");

  if (
    existing.systemRole === "ORG_OWNER" &&
    input.systemRole !== "ORG_OWNER" &&
    isLastOwner(await ownerCount(ctx), existing)
  ) {
    throw new DomainError("CONFLICT", "The organization needs at least one active owner.");
  }

  const clash = await prisma.user.findFirst({
    where: {
      organizationId: ctx.organizationId,
      email: input.email,
      deletedAt: null,
      id: { not: id },
    },
    select: { id: true },
  });
  if (clash) {
    throw new DomainError("CONFLICT", "A user with this email already exists.", {
      email: "Email already in use",
    });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
      systemRole: input.systemRole,
      branchIds: input.branchIds,
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      updatedById: ctx.userId,
    },
  });
  audit(ctx, {
    action: "settings.user.update",
    entityType: "User",
    entityId: id,
    before: { email: existing.email, systemRole: existing.systemRole },
    after: { email: input.email, systemRole: input.systemRole },
  });
  return user;
}

async function removeUser(ctx: TenantContext, id: string) {
  const existing = await prisma.user.findFirst({ where: { ...tenantWhere(ctx), id } });
  if (!existing) throw new DomainError("NOT_FOUND", "User not found.");
  if (id === ctx.userId) {
    throw new DomainError("CONFLICT", "You cannot remove your own account.");
  }
  if (isLastOwner(await ownerCount(ctx), existing)) {
    throw new DomainError("CONFLICT", "The organization needs at least one active owner.");
  }
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), status: "INACTIVE", updatedById: ctx.userId },
  });
  // Removed users must not keep working sessions.
  await prisma.session.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  audit(ctx, {
    action: "settings.user.delete",
    entityType: "User",
    entityId: id,
    before: { email: existing.email, systemRole: existing.systemRole },
  });
}

// ─────────────────────────────── roles ───────────────────────────────

async function roles(ctx: TenantContext) {
  const rows = await prisma.role.findMany({
    where: tenantWhere(ctx),
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissions: r.permissions,
    userCount: r._count.users,
  }));
}

async function createRole(ctx: TenantContext, input: RoleInput) {
  // Look past `deletedAt` here: the unique index is (organizationId, name) and
  // does not include it, so a soft-deleted row still occupies the name. Scoping
  // this check with tenantWhere() would miss it and surface as a raw P2002.
  const clash = await prisma.role.findFirst({
    where: { organizationId: ctx.organizationId, name: input.name },
    select: { id: true, deletedAt: true },
  });
  if (clash && !clash.deletedAt) {
    throw new DomainError("CONFLICT", "A role with this name already exists.", {
      name: "Name already in use",
    });
  }

  // Reviving the soft-deleted row keeps the name usable without a hard delete.
  const role = clash
    ? await prisma.role.update({
        where: { id: clash.id },
        data: {
          deletedAt: null,
          status: "ACTIVE",
          description: input.description || null,
          permissions: normalizePermissions(input.permissions),
        },
      })
    : await prisma.role.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          description: input.description || null,
          permissions: normalizePermissions(input.permissions),
        },
      });
  audit(ctx, {
    action: "settings.role.create",
    entityType: "Role",
    entityId: role.id,
    after: input,
  });
  return role;
}

async function updateRole(ctx: TenantContext, id: string, input: RoleInput) {
  const existing = await prisma.role.findFirst({ where: { ...tenantWhere(ctx), id } });
  if (!existing) throw new DomainError("NOT_FOUND", "Role not found.");
  if (existing.isSystem) {
    throw new DomainError("CONFLICT", "System roles cannot be edited. Clone one instead.");
  }
  const clash = await prisma.role.findFirst({
    where: { organizationId: ctx.organizationId, name: input.name, id: { not: id } },
    select: { id: true, deletedAt: true },
  });
  if (clash && !clash.deletedAt) {
    throw new DomainError("CONFLICT", "A role with this name already exists.", {
      name: "Name already in use",
    });
  }
  if (clash?.deletedAt) {
    // A soft-deleted namesake would collide on the unique index — free the name.
    await prisma.role.delete({ where: { id: clash.id } });
  }
  const role = await prisma.role.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description || null,
      permissions: normalizePermissions(input.permissions),
    },
  });
  audit(ctx, {
    action: "settings.role.update",
    entityType: "Role",
    entityId: id,
    before: { name: existing.name, permissions: existing.permissions },
    after: input,
  });
  return role;
}

async function removeRole(ctx: TenantContext, id: string) {
  const existing = await prisma.role.findFirst({
    where: { ...tenantWhere(ctx), id },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) throw new DomainError("NOT_FOUND", "Role not found.");
  if (existing.isSystem) {
    throw new DomainError("CONFLICT", "System roles cannot be deleted.");
  }
  if (existing._count.users > 0) {
    throw new DomainError(
      "CONFLICT",
      `This role is assigned to ${existing._count.users} user(s). Unassign them first.`,
    );
  }
  await prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
  audit(ctx, {
    action: "settings.role.delete",
    entityType: "Role",
    entityId: id,
    before: { name: existing.name },
  });
}

// ─────────────────────────────── audit trail ───────────────────────────────

async function auditTrail(ctx: TenantContext, query: AuditQuery) {
  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
  });

  const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => v !== null))];
  const actors = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    actor: r.userId ? (names.get(r.userId) ?? "(removed user)") : "System",
    createdAt: r.createdAt.toISOString(),
  }));
}

export const settingsService = {
  organization,
  updateOrganization,
  branches,
  createBranch,
  updateBranch,
  removeBranch,
  users,
  createUser,
  updateUser,
  removeUser,
  roles,
  createRole,
  updateRole,
  removeRole,
  auditTrail,
};

