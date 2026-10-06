import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { permissionsForRole } from "@/lib/rbac";
import type { RegisterOrgInput, LoginInput } from "../dto/auth.dto";
import type { SessionClaims } from "@/lib/auth/session";

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

/** Bootstrap a new organization with its owner account and a default branch. */
export async function registerOrganization(
  input: RegisterOrgInput,
): Promise<Omit<SessionClaims, "sessionId">> {
  const existing = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
  });
  if (existing) {
    throw new DomainError("CONFLICT", "An account with this email already exists.", {
      email: "Already registered",
    });
  }

  let slug = slugify(input.organizationName);
  if (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
  }

  const passwordHash = await hashPassword(input.password);

  const { user, branch } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: input.organizationName, slug, email: input.email },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Main Branch", code: "MAIN" },
    });
    const user = await tx.user.create({
      data: {
        organizationId: org.id,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        systemRole: "ORG_OWNER",
        emailVerified: false,
      },
    });
    return { user, branch };
  });

  // Fetch custom role permissions assigned to this user
  const userRoles = await prisma.userRole.findMany({
    where: { userId: user.id },
    include: { role: { select: { permissions: true, deletedAt: true } } },
  });
  const extraPermissions = userRoles
    .filter((ur) => !ur.role.deletedAt)
    .flatMap((ur) => ur.role.permissions);

  return {
    userId: user.id,
    organizationId: user.organizationId,
    branchId: branch.id,
    systemRole: user.systemRole,
    permissions: permissionsForRole(user.systemRole, extraPermissions),
  };
}

export async function authenticate(
  input: LoginInput,
  meta: { ipAddress?: string; userAgent?: string },
): Promise<Omit<SessionClaims, "sessionId">> {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null, status: "ACTIVE" },
  });

  const recordLogin = (success: boolean, reason?: string) =>
    user &&
    prisma.loginHistory
      .create({
        data: { userId: user.id, success, reason, ...meta },
      })
      .catch(() => undefined);

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    await recordLogin(false, "invalid-credentials");
    throw new DomainError("VALIDATION_ERROR", "Invalid email or password.");
  }

  const defaultBranch = user.organizationId
    ? await prisma.branch.findFirst({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: "ACTIVE",
          ...(user.branchIds.length ? { id: { in: user.branchIds } } : {}),
        },
        orderBy: { createdAt: "asc" },
      })
    : null;

  // Fetch custom role permissions assigned to this user
  const userRoles = await prisma.userRole.findMany({
    where: { userId: user.id },
    include: { role: { select: { permissions: true, deletedAt: true } } },
  });
  const extraPermissions = userRoles
    .filter((ur) => !ur.role.deletedAt)
    .flatMap((ur) => ur.role.permissions);

  await Promise.all([
    recordLogin(true),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);

  return {
    userId: user.id,
    organizationId: user.organizationId,
    branchId: defaultBranch?.id ?? null,
    systemRole: user.systemRole,
    permissions: permissionsForRole(user.systemRole, extraPermissions),
  };
}
