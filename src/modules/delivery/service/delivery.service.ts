import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import {
  tenantWhere,
  branchWhere,
  orgWhere,
  orgBranchWhere,
  type TenantContext,
} from "@/lib/auth/context";
import type { Prisma, DeliveryStatus } from "@/generated/prisma/client";
import type {
  RiderInput,
  ZoneInput,
  AssignRiderInput,
  DeliveryStatusInput,
  ConfirmDeliveryInput,
  DeliveryListQuery,
} from "../dto/delivery.dto";

function requireBranch(ctx: TenantContext) {
  if (!ctx.branchId) throw new DomainError("VALIDATION_ERROR", "Select a branch first.");
  return ctx.branchId;
}

/** Deliveries still in flight — these hold a rider and count as active workload. */
export const OPEN_STATUSES: DeliveryStatus[] = [
  "PENDING",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
];

/** Legal delivery lifecycle moves. Terminal states accept nothing further. */
const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ["ASSIGNED", "FAILED"],
  ASSIGNED: ["PICKED_UP", "PENDING", "FAILED"],
  PICKED_UP: ["IN_TRANSIT", "DELIVERED", "FAILED"],
  IN_TRANSIT: ["DELIVERED", "FAILED", "RETURNED"],
  DELIVERED: [],
  FAILED: ["RETURNED"],
  RETURNED: [],
};

export function canTransition(from: DeliveryStatus, to: DeliveryStatus) {
  return TRANSITIONS[from].includes(to);
}

/** A rider is free to take a run only when marked available and idle. */
export function isRiderFree(isAvailable: boolean, openDeliveries: number) {
  return isAvailable && openDeliveries === 0;
}

/**
 * Rider payout for one run: a flat base plus the zone fee share, floored at the
 * base so a zero-fee zone still pays. Kept pure so it is cheap to test.
 */
export function riderEarningFor(zoneFee: number, baseFee = 50, sharePct = 60) {
  const share = (zoneFee * sharePct) / 100;
  return Math.round((baseFee + Math.max(0, share)) * 100) / 100;
}

/** 4-digit proof-of-delivery code. Uses a CSPRNG — it authorises a handover. */
export function generateOtp() {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

function dayBounds(date?: string) {
  const base = date ? new Date(`${date}T00:00:00`) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export const deliveryService = {
  async list(ctx: TenantContext, query: DeliveryListQuery) {
    const { start, end } = dayBounds(query.date);
    const where: Prisma.DeliveryWhereInput = {
      ...orgBranchWhere(ctx),
      createdAt: { gte: start, lt: end },
      ...(query.deliveryStatus ? { deliveryStatus: query.deliveryStatus } : {}),
      ...(query.riderId ? { riderId: query.riderId } : {}),
      ...(query.search
        ? {
            OR: [
              { address: { contains: query.search, mode: "insensitive" } },
              { order: { orderNumber: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const deliveries = await prisma.delivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        rider: { select: { id: true, name: true, phone: true } },
        zone: { select: { id: true, name: true, etaMinutes: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            customer: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
      },
    });

    return deliveries.map((d) => {
      const customer = d.order.customer;
      const customerName = customer
        ? `${customer.firstName}${customer.lastName ? ` ${customer.lastName}` : ""}`
        : null;
      return {
        id: d.id,
        orderId: d.orderId,
        orderNumber: d.order.orderNumber,
        orderTotal: Number(d.order.totalAmount),
        customerName,
        customerPhone: customer?.phone ?? null,
        address: d.address,
        deliveryStatus: d.deliveryStatus,
        riderId: d.riderId,
        riderName: d.rider?.name ?? null,
        riderPhone: d.rider?.phone ?? null,
        zoneId: d.zoneId,
        zoneName: d.zone?.name ?? null,
        etaMinutes: d.zone?.etaMinutes ?? null,
        riderEarning: Number(d.riderEarning),
        assignedAt: d.assignedAt,
        pickedUpAt: d.pickedUpAt,
        deliveredAt: d.deliveredAt,
        createdAt: d.createdAt,
        // The OTP is only meaningful while the run is live; never leak it after.
        otpCode: OPEN_STATUSES.includes(d.deliveryStatus) ? d.otpCode : null,
      };
    });
  },

  /** Riders with their live workload, so dispatch can see who is actually free. */
  async riders(ctx: TenantContext) {
    const riders = await prisma.rider.findMany({
      where: { ...tenantWhere(ctx), status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { deliveries: { where: { deliveryStatus: { in: OPEN_STATUSES } } } } },
      },
    });

    const earnings = await prisma.delivery.groupBy({
      by: ["riderId"],
      where: { ...orgWhere(ctx), deliveryStatus: "DELIVERED" },
      _sum: { riderEarning: true },
      _count: { _all: true },
    });
    const byRider = new Map(earnings.map((e) => [e.riderId, e]));

    return riders.map((r) => {
      const stats = byRider.get(r.id);
      const openDeliveries = r._count.deliveries;
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        vehicleType: r.vehicleType,
        vehicleNumber: r.vehicleNumber,
        isAvailable: r.isAvailable,
        openDeliveries,
        isFree: isRiderFree(r.isAvailable, openDeliveries),
        completedRuns: stats?._count._all ?? 0,
        totalEarned: Number(stats?._sum.riderEarning ?? 0),
      };
    });
  },

  async zones(ctx: TenantContext) {
    const zones = await prisma.deliveryZone.findMany({
      where: { ...branchWhere(ctx), status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      deliveryFee: Number(z.deliveryFee),
      minOrderAmount: Number(z.minOrderAmount),
      etaMinutes: z.etaMinutes,
    }));
  },

  async summary(ctx: TenantContext, date?: string) {
    const { start, end } = dayBounds(date);
    const scope = { ...orgBranchWhere(ctx), createdAt: { gte: start, lt: end } };

    const [grouped, payout, riderCounts] = await Promise.all([
      prisma.delivery.groupBy({
        by: ["deliveryStatus"],
        where: scope,
        _count: { _all: true },
      }),
      prisma.delivery.aggregate({
        where: { ...scope, deliveryStatus: "DELIVERED" },
        _sum: { riderEarning: true },
      }),
      prisma.rider.groupBy({
        by: ["isAvailable"],
        where: { ...tenantWhere(ctx), status: "ACTIVE" },
        _count: { _all: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.deliveryStatus, g._count._all]),
    ) as Partial<Record<DeliveryStatus, number>>;

    return {
      total: grouped.reduce((sum, g) => sum + g._count._all, 0),
      pending: byStatus.PENDING ?? 0,
      inFlight:
        (byStatus.ASSIGNED ?? 0) + (byStatus.PICKED_UP ?? 0) + (byStatus.IN_TRANSIT ?? 0),
      delivered: byStatus.DELIVERED ?? 0,
      failed: (byStatus.FAILED ?? 0) + (byStatus.RETURNED ?? 0),
      payout: Number(payout._sum.riderEarning ?? 0),
      ridersAvailable: riderCounts.find((r) => r.isAvailable)?._count._all ?? 0,
      ridersTotal: riderCounts.reduce((sum, r) => sum + r._count._all, 0),
    };
  },

  /**
   * Hand a run to a rider. Generating the OTP here means the code exists from the
   * moment someone is accountable for the order, and only then.
   */
  async assign(ctx: TenantContext, input: AssignRiderInput) {
    const delivery = await prisma.delivery.findFirst({
      where: { ...orgBranchWhere(ctx), id: input.deliveryId },
      include: { zone: { select: { deliveryFee: true } } },
    });
    if (!delivery) throw new DomainError("NOT_FOUND", "Delivery not found.");
    if (!OPEN_STATUSES.includes(delivery.deliveryStatus)) {
      throw new DomainError(
        "VALIDATION_ERROR",
        `This run is already ${delivery.deliveryStatus.toLowerCase()}.`,
      );
    }

    const rider = await prisma.rider.findFirst({
      where: { ...tenantWhere(ctx), id: input.riderId },
    });
    if (!rider) throw new DomainError("NOT_FOUND", "Rider not found.");
    if (!rider.isAvailable) {
      throw new DomainError("CONFLICT", `${rider.name} is marked unavailable.`, {
        riderId: "Not available",
      });
    }

    const earning =
      input.riderEarning > 0
        ? input.riderEarning
        : riderEarningFor(Number(delivery.zone?.deliveryFee ?? 0));

    const updated = await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        riderId: rider.id,
        deliveryStatus: "ASSIGNED",
        assignedAt: new Date(),
        riderEarning: earning,
        otpCode: delivery.otpCode ?? generateOtp(),
      },
    });

    audit(ctx, {
      action: "delivery.assign",
      entityType: "Delivery",
      entityId: delivery.id,
      before: { riderId: delivery.riderId, deliveryStatus: delivery.deliveryStatus },
      after: { riderId: rider.id, deliveryStatus: "ASSIGNED", riderEarning: earning },
    });
    return { otpCode: updated.otpCode };
  },

  async setStatus(ctx: TenantContext, input: DeliveryStatusInput) {
    const delivery = await prisma.delivery.findFirst({
      where: { ...orgBranchWhere(ctx), id: input.deliveryId },
    });
    if (!delivery) throw new DomainError("NOT_FOUND", "Delivery not found.");
    if (delivery.deliveryStatus === input.deliveryStatus) return;

    if (!canTransition(delivery.deliveryStatus, input.deliveryStatus)) {
      throw new DomainError(
        "VALIDATION_ERROR",
        `Cannot move a ${delivery.deliveryStatus.toLowerCase()} run to ${input.deliveryStatus.toLowerCase()}.`,
      );
    }
    // DELIVERED is reached through confirm(), which checks the OTP first.
    if (input.deliveryStatus === "DELIVERED") {
      throw new DomainError("VALIDATION_ERROR", "Confirm the delivery OTP to close this run.");
    }

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        deliveryStatus: input.deliveryStatus,
        pickedUpAt:
          input.deliveryStatus === "PICKED_UP" ? new Date() : delivery.pickedUpAt,
        // Bouncing back to PENDING frees the rider for another run.
        riderId: input.deliveryStatus === "PENDING" ? null : delivery.riderId,
        assignedAt: input.deliveryStatus === "PENDING" ? null : delivery.assignedAt,
      },
    });

    audit(ctx, {
      action: `delivery.status.${input.deliveryStatus.toLowerCase()}`,
      entityType: "Delivery",
      entityId: delivery.id,
      before: { deliveryStatus: delivery.deliveryStatus },
      after: { deliveryStatus: input.deliveryStatus },
    });
  },

  /**
   * Close a run against the customer's OTP. This is the proof of delivery, so a
   * wrong code must not advance the status — and a mismatch is worth auditing.
   */
  async confirm(ctx: TenantContext, input: ConfirmDeliveryInput) {
    const delivery = await prisma.delivery.findFirst({
      where: { ...orgBranchWhere(ctx), id: input.deliveryId },
    });
    if (!delivery) throw new DomainError("NOT_FOUND", "Delivery not found.");

    if (delivery.deliveryStatus === "DELIVERED") {
      throw new DomainError("CONFLICT", "This run is already closed.");
    }
    if (!canTransition(delivery.deliveryStatus, "DELIVERED")) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Mark the order picked up before confirming delivery.",
      );
    }
    if (!delivery.otpCode) {
      throw new DomainError("VALIDATION_ERROR", "No OTP was issued for this run.");
    }
    if (delivery.otpCode !== input.otpCode) {
      audit(ctx, {
        action: "delivery.otp.mismatch",
        entityType: "Delivery",
        entityId: delivery.id,
      });
      throw new DomainError("VALIDATION_ERROR", "That code does not match.", {
        otpCode: "Incorrect code",
      });
    }

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        deliveryStatus: "DELIVERED",
        deliveredAt: new Date(),
        proofImageUrl: input.proofImageUrl || delivery.proofImageUrl,
        // Consume the code so it cannot be replayed.
        otpCode: null,
      },
    });

    audit(ctx, {
      action: "delivery.confirm",
      entityType: "Delivery",
      entityId: delivery.id,
      before: { deliveryStatus: delivery.deliveryStatus },
      after: { deliveryStatus: "DELIVERED" },
    });
  },

  async createRider(ctx: TenantContext, input: RiderInput) {
    const rider = await prisma.rider.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        phone: input.phone,
        vehicleType: input.vehicleType || null,
        vehicleNumber: input.vehicleNumber || null,
        isAvailable: input.isAvailable,
      },
    });
    audit(ctx, {
      action: "delivery.rider.create",
      entityType: "Rider",
      entityId: rider.id,
      after: rider,
    });
    return rider;
  },

  async updateRider(ctx: TenantContext, id: string, input: RiderInput) {
    const before = await prisma.rider.findFirst({ where: { ...tenantWhere(ctx), id } });
    if (!before) throw new DomainError("NOT_FOUND", "Rider not found.");

    await prisma.rider.update({
      where: { id },
      data: {
        name: input.name,
        phone: input.phone,
        vehicleType: input.vehicleType || null,
        vehicleNumber: input.vehicleNumber || null,
        isAvailable: input.isAvailable,
      },
    });
    audit(ctx, {
      action: "delivery.rider.update",
      entityType: "Rider",
      entityId: id,
      before,
      after: input,
    });
  },

  async removeRider(ctx: TenantContext, id: string) {
    const open = await prisma.delivery.count({
      where: { ...orgWhere(ctx), riderId: id, deliveryStatus: { in: OPEN_STATUSES } },
    });
    if (open > 0) {
      throw new DomainError("CONFLICT", "This rider still has runs in progress.");
    }
    const result = await prisma.rider.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { deletedAt: new Date(), status: "INACTIVE", isAvailable: false },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Rider not found.");
    audit(ctx, { action: "delivery.rider.delete", entityType: "Rider", entityId: id });
  },

  async createZone(ctx: TenantContext, input: ZoneInput) {
    const branchId = requireBranch(ctx);
    const duplicate = await prisma.deliveryZone.findFirst({
      where: { branchId, name: input.name, deletedAt: null },
    });
    if (duplicate) {
      throw new DomainError("CONFLICT", "A zone with this name already exists.", {
        name: "Already in use",
      });
    }

    const zone = await prisma.deliveryZone.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        name: input.name,
        deliveryFee: input.deliveryFee,
        minOrderAmount: input.minOrderAmount,
        etaMinutes: input.etaMinutes,
      },
    });
    audit(ctx, {
      action: "delivery.zone.create",
      entityType: "DeliveryZone",
      entityId: zone.id,
      after: zone,
    });
    return zone;
  },

  async updateZone(ctx: TenantContext, id: string, input: ZoneInput) {
    const before = await prisma.deliveryZone.findFirst({ where: { ...branchWhere(ctx), id } });
    if (!before) throw new DomainError("NOT_FOUND", "Zone not found.");

    await prisma.deliveryZone.update({
      where: { id },
      data: {
        name: input.name,
        deliveryFee: input.deliveryFee,
        minOrderAmount: input.minOrderAmount,
        etaMinutes: input.etaMinutes,
      },
    });
    audit(ctx, {
      action: "delivery.zone.update",
      entityType: "DeliveryZone",
      entityId: id,
      before,
      after: input,
    });
  },

  async removeZone(ctx: TenantContext, id: string) {
    const result = await prisma.deliveryZone.updateMany({
      where: { ...branchWhere(ctx), id },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Zone not found.");
    audit(ctx, { action: "delivery.zone.delete", entityType: "DeliveryZone", entityId: id });
  },
};
