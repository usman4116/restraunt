import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import type { Prisma } from "@/generated/prisma/client";
import type {
  CustomerInput,
  CustomerListQuery,
  LoyaltyAdjustInput,
} from "../dto/customer.dto";

/** Spend thresholds for automatic tier assignment. Highest match wins. */
export const LOYALTY_TIERS = [
  { name: "PLATINUM", minSpend: 5000 },
  { name: "GOLD", minSpend: 2000 },
  { name: "SILVER", minSpend: 500 },
  { name: "BRONZE", minSpend: 0 },
] as const;

export function tierForSpend(totalSpent: number): string {
  return LOYALTY_TIERS.find((t) => totalSpent >= t.minSpend)!.name;
}

const toDate = (value: string | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

export const customerService = {
  async list(ctx: TenantContext, query: CustomerListQuery) {
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      ...tenantWhere(ctx),
      ...(query.tier ? { loyaltyTier: query.tier } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: [{ totalSpent: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      customers: customers.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null,
        address: c.address,
        notes: c.notes,
        tags: c.tags,
        loyaltyPoints: c.loyaltyPoints,
        loyaltyTier: c.loyaltyTier,
        totalSpent: Number(c.totalSpent),
        visitCount: c.visitCount,
        marketingOptIn: c.marketingOptIn,
      })),
      total,
    };
  },

  /** Aggregates for the header tiles: base size, opt-ins, upcoming birthdays. */
  async summary(ctx: TenantContext) {
    const scope = tenantWhere(ctx);
    const [total, optedIn, aggregate, openComplaints, customers] = await prisma.$transaction([
      prisma.customer.count({ where: scope }),
      prisma.customer.count({ where: { ...scope, marketingOptIn: true } }),
      prisma.customer.aggregate({ where: scope, _sum: { totalSpent: true, loyaltyPoints: true } }),
      prisma.feedback.count({
        where: { organizationId: ctx.organizationId, isComplaint: true, resolvedAt: null },
      }),
      prisma.customer.findMany({
        where: { ...scope, birthday: { not: null } },
        select: { birthday: true },
      }),
    ]);

    // Birthdays inside the next 30 days, comparing month/day only.
    const today = new Date();
    const dayOfYear = (month: number, day: number) => month * 31 + day;
    const from = dayOfYear(today.getUTCMonth(), today.getUTCDate());
    const birthdaysSoon = customers.filter(({ birthday }) => {
      if (!birthday) return false;
      const at = dayOfYear(birthday.getUTCMonth(), birthday.getUTCDate());
      const delta = at >= from ? at - from : at + 372 - from;
      return delta <= 31;
    }).length;

    return {
      total,
      optedIn,
      totalSpent: Number(aggregate._sum.totalSpent ?? 0),
      pointsOutstanding: aggregate._sum.loyaltyPoints ?? 0,
      openComplaints,
      birthdaysSoon,
    };
  },

  async create(ctx: TenantContext, input: CustomerInput) {
    if (input.phone) {
      const duplicate = await prisma.customer.findFirst({
        where: { organizationId: ctx.organizationId, phone: input.phone, deletedAt: null },
      });
      if (duplicate) {
        throw new DomainError("CONFLICT", "A customer with this phone already exists.", {
          phone: "Already in use",
        });
      }
    }
    const customer = await prisma.customer.create({
      data: {
        organizationId: ctx.organizationId,
        firstName: input.firstName,
        lastName: input.lastName || null,
        email: input.email || null,
        phone: input.phone || null,
        birthday: toDate(input.birthday),
        address: input.address || null,
        notes: input.notes || null,
        tags: input.tags,
        marketingOptIn: input.marketingOptIn,
        createdById: ctx.userId,
      },
    });
    audit(ctx, {
      action: "customers.create",
      entityType: "Customer",
      entityId: customer.id,
      after: customer,
    });
    return customer;
  },

  async update(ctx: TenantContext, id: string, input: CustomerInput) {
    const before = await prisma.customer.findFirst({ where: { ...tenantWhere(ctx), id } });
    if (!before) throw new DomainError("NOT_FOUND", "Customer not found.");

    if (input.phone && input.phone !== before.phone) {
      const duplicate = await prisma.customer.findFirst({
        where: {
          organizationId: ctx.organizationId,
          phone: input.phone,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new DomainError("CONFLICT", "A customer with this phone already exists.", {
          phone: "Already in use",
        });
      }
    }

    await prisma.customer.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName || null,
        email: input.email || null,
        phone: input.phone || null,
        birthday: toDate(input.birthday),
        address: input.address || null,
        notes: input.notes || null,
        tags: input.tags,
        marketingOptIn: input.marketingOptIn,
        updatedById: ctx.userId,
      },
    });
    audit(ctx, {
      action: "customers.update",
      entityType: "Customer",
      entityId: id,
      before,
      after: input,
    });
  },

  async remove(ctx: TenantContext, id: string) {
    const result = await prisma.customer.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { deletedAt: new Date(), updatedById: ctx.userId },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Customer not found.");
    audit(ctx, { action: "customers.delete", entityType: "Customer", entityId: id });
  },

  /** Adjust loyalty points: earn, redeem, or manual correction. */
  async adjustLoyalty(ctx: TenantContext, input: LoyaltyAdjustInput) {
    const customer = await prisma.customer.findFirst({
      where: { ...tenantWhere(ctx), id: input.customerId },
    });
    if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.");

    const delta = input.type === "REDEEM" ? -Math.abs(input.points) : input.points;
    const newTotal = customer.loyaltyPoints + delta;
    if (newTotal < 0) {
      throw new DomainError("VALIDATION_ERROR", "Insufficient loyalty points.", {
        points: "Customer only has " + customer.loyaltyPoints,
      });
    }

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { loyaltyPoints: newTotal, updatedById: ctx.userId },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          organizationId: ctx.organizationId,
          customerId: customer.id,
          type: input.type,
          points: delta,
          note: input.note || null,
          createdById: ctx.userId,
        },
      }),
    ]);

    audit(ctx, {
      action: "customers.loyalty.adjust",
      entityType: "Customer",
      entityId: customer.id,
      after: { type: input.type, points: delta, newTotal },
    });
  },

  /** Recent loyalty transactions for a customer. */
  loyaltyHistory(ctx: TenantContext, customerId: string, limit = 20) {
    return prisma.loyaltyTransaction.findMany({
      where: { organizationId: ctx.organizationId, customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  /** Recent feedback from all customers. */
  async recentFeedback(ctx: TenantContext, limit = 30) {
    const feedback = await prisma.feedback.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { customer: { select: { firstName: true, lastName: true } } },
    });
    return feedback.map((f) => ({
      id: f.id,
      customerName: f.customer
        ? `${f.customer.firstName} ${f.customer.lastName || ""}`.trim()
        : "Guest",
      rating: f.rating,
      comment: f.comment,
      isComplaint: f.isComplaint,
      resolvedAt: f.resolvedAt,
      createdAt: f.createdAt,
    }));
  },

  /** Mark a complaint as resolved. */
  async resolveFeedback(ctx: TenantContext, feedbackId: string) {
    const feedback = await prisma.feedback.findFirst({
      where: { organizationId: ctx.organizationId, id: feedbackId },
    });
    if (!feedback) throw new DomainError("NOT_FOUND", "Feedback not found.");
    await prisma.feedback.update({
      where: { id: feedbackId },
      data: { resolvedAt: new Date(), resolvedById: ctx.userId },
    });
    audit(ctx, {
      action: "customers.feedback.resolve",
      entityType: "Feedback",
      entityId: feedbackId,
    });
  },
};
