import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { branchWhere, type TenantContext } from "@/lib/auth/context";
import type { Prisma, ReservationStatus } from "@/generated/prisma/client";
import type {
  ReservationInput,
  ReservationStatusInput,
  ReservationListQuery,
  TableInput,
  SectionInput,
  TableStatusInput,
} from "../dto/reservation.dto";

function requireBranch(ctx: TenantContext) {
  if (!ctx.branchId) throw new DomainError("VALIDATION_ERROR", "Select a branch first.");
  return ctx.branchId;
}

/** Statuses that still hold a table (used for double-booking checks). */
const BLOCKING_STATUSES: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

/** Which status transitions are legal. Terminal states accept nothing further. */
const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "SEATED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus) {
  return TRANSITIONS[from].includes(to);
}

/** Two [start,end) intervals overlap when each starts before the other ends. */
export function overlaps(
  aStart: Date,
  aDurationMin: number,
  bStart: Date,
  bDurationMin: number,
) {
  const aEnd = aStart.getTime() + aDurationMin * 60_000;
  const bEnd = bStart.getTime() + bDurationMin * 60_000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}

/** Parse "YYYY-MM-DDTHH:mm" as server-local wall-clock time. */
function parseLocalDateTime(value: string) {
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function dayBounds(date?: string) {
  const base = date ? parseLocalDateTime(`${date}T00:00`) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export const reservationService = {
  async list(ctx: TenantContext, query: ReservationListQuery) {
    const { start, end } = dayBounds(query.date);
    const where: Prisma.ReservationWhereInput = {
      ...branchWhere(ctx),
      reservedAt: { gte: start, lt: end },
      ...(query.status ? { resStatus: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { guestName: { contains: query.search, mode: "insensitive" } },
              { guestPhone: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: { reservedAt: "asc" },
      include: {
        table: { select: { id: true, name: true, capacity: true } },
        customer: { select: { id: true, loyaltyTier: true } },
      },
    });

    return reservations.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      partySize: r.partySize,
      reservedAt: r.reservedAt,
      durationMin: r.durationMin,
      status: r.resStatus,
      notes: r.notes,
      seatedAt: r.seatedAt,
      tableId: r.tableId,
      tableName: r.table?.name ?? null,
      customerId: r.customerId,
      loyaltyTier: r.customer?.loyaltyTier ?? null,
    }));
  },

  async floorPlan(ctx: TenantContext) {
    const sections = await prisma.floorSection.findMany({
      where: { ...branchWhere(ctx), status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        tables: {
          where: { deletedAt: null, status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, capacity: true, tableStatus: true },
        },
      },
    });
    return sections.map((s) => ({
      id: s.id,
      name: s.name,
      sortOrder: s.sortOrder,
      tables: s.tables,
    }));
  },

  async summary(ctx: TenantContext, date?: string) {
    const { start, end } = dayBounds(date);
    const scope = { ...branchWhere(ctx), reservedAt: { gte: start, lt: end } };

    const [grouped, covers, tables] = await Promise.all([
      prisma.reservation.groupBy({
        by: ["resStatus"],
        where: scope,
        _count: { _all: true },
      }),
      prisma.reservation.aggregate({
        where: { ...scope, resStatus: { in: BLOCKING_STATUSES } },
        _sum: { partySize: true },
      }),
      prisma.diningTable.groupBy({
        by: ["tableStatus"],
        where: { ...branchWhere(ctx), status: "ACTIVE" },
        _count: { _all: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.resStatus, g._count._all]),
    ) as Partial<Record<ReservationStatus, number>>;

    const tableCounts = Object.fromEntries(tables.map((t) => [t.tableStatus, t._count._all]));
    const totalTables = tables.reduce((sum, t) => sum + t._count._all, 0);

    return {
      total: grouped.reduce((sum, g) => sum + g._count._all, 0),
      pending: byStatus.PENDING ?? 0,
      confirmed: byStatus.CONFIRMED ?? 0,
      seated: byStatus.SEATED ?? 0,
      noShow: byStatus.NO_SHOW ?? 0,
      cancelled: byStatus.CANCELLED ?? 0,
      covers: covers._sum.partySize ?? 0,
      totalTables,
      availableTables: tableCounts.AVAILABLE ?? 0,
      occupiedTables: tableCounts.OCCUPIED ?? 0,
    };
  },

  /** Reject a booking that would double-book the table for an overlapping window. */
  async assertTableFree(
    ctx: TenantContext,
    tableId: string,
    reservedAt: Date,
    durationMin: number,
    excludeReservationId?: string,
  ) {
    // Widen the fetch window to the longest plausible sitting, then compare precisely.
    const windowStart = new Date(reservedAt.getTime() - 12 * 60 * 60_000);
    const windowEnd = new Date(reservedAt.getTime() + 12 * 60 * 60_000);

    const sameTable = await prisma.reservation.findMany({
      where: {
        ...branchWhere(ctx),
        tableId,
        resStatus: { in: BLOCKING_STATUSES },
        reservedAt: { gte: windowStart, lte: windowEnd },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      select: { id: true, reservedAt: true, durationMin: true, guestName: true },
    });

    const clash = sameTable.find((r) =>
      overlaps(reservedAt, durationMin, r.reservedAt, r.durationMin),
    );
    if (clash) {
      throw new DomainError("CONFLICT", `Table is already booked for ${clash.guestName}.`, {
        tableId: "Double booking",
      });
    }
  },

  async create(ctx: TenantContext, input: ReservationInput) {
    const branchId = requireBranch(ctx);
    const reservedAt = parseLocalDateTime(input.reservedAt);

    if (input.tableId) {
      const table = await prisma.diningTable.findFirst({
        where: { ...branchWhere(ctx), id: input.tableId },
      });
      if (!table) throw new DomainError("NOT_FOUND", "Table not found.");
      if (table.capacity < input.partySize) {
        throw new DomainError("VALIDATION_ERROR", "Party is larger than the table capacity.", {
          partySize: `Table seats ${table.capacity}`,
        });
      }
      await this.assertTableFree(ctx, input.tableId, reservedAt, input.durationMin);
    }

    const reservation = await prisma.reservation.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        customerId: input.customerId || null,
        tableId: input.tableId || null,
        guestName: input.guestName,
        guestPhone: input.guestPhone || null,
        partySize: input.partySize,
        reservedAt,
        durationMin: input.durationMin,
        notes: input.notes || null,
        createdById: ctx.userId,
      },
    });

    audit(ctx, {
      action: "reservations.create",
      entityType: "Reservation",
      entityId: reservation.id,
      after: reservation,
    });
    return reservation;
  },

  async update(ctx: TenantContext, id: string, input: ReservationInput) {
    const before = await prisma.reservation.findFirst({ where: { ...branchWhere(ctx), id } });
    if (!before) throw new DomainError("NOT_FOUND", "Reservation not found.");
    const reservedAt = parseLocalDateTime(input.reservedAt);

    if (input.tableId) {
      await this.assertTableFree(ctx, input.tableId, reservedAt, input.durationMin, id);
    }

    await prisma.reservation.update({
      where: { id },
      data: {
        customerId: input.customerId || null,
        tableId: input.tableId || null,
        guestName: input.guestName,
        guestPhone: input.guestPhone || null,
        partySize: input.partySize,
        reservedAt,
        durationMin: input.durationMin,
        notes: input.notes || null,
      },
    });

    audit(ctx, {
      action: "reservations.update",
      entityType: "Reservation",
      entityId: id,
      before,
      after: input,
    });
  },

  /**
   * Move a booking through its lifecycle. Seating occupies the table and
   * completing / cancelling releases it, so the floor plan stays truthful.
   */
  async setStatus(ctx: TenantContext, input: ReservationStatusInput) {
    const reservation = await prisma.reservation.findFirst({
      where: { ...branchWhere(ctx), id: input.reservationId },
    });
    if (!reservation) throw new DomainError("NOT_FOUND", "Reservation not found.");

    if (reservation.resStatus === input.status) return;
    if (!canTransition(reservation.resStatus, input.status)) {
      throw new DomainError(
        "VALIDATION_ERROR",
        `Cannot move a ${reservation.resStatus.toLowerCase()} booking to ${input.status.toLowerCase()}.`,
      );
    }

    const releasesTable = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(input.status);

    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          resStatus: input.status,
          seatedAt: input.status === "SEATED" ? new Date() : reservation.seatedAt,
        },
      });

      if (reservation.tableId && (input.status === "SEATED" || releasesTable)) {
        await tx.diningTable.updateMany({
          where: { id: reservation.tableId, organizationId: ctx.organizationId },
          data: { tableStatus: input.status === "SEATED" ? "OCCUPIED" : "AVAILABLE" },
        });
      }
    });

    audit(ctx, {
      action: `reservations.status.${input.status.toLowerCase()}`,
      entityType: "Reservation",
      entityId: reservation.id,
      before: { status: reservation.resStatus },
      after: { status: input.status },
    });
  },

  async remove(ctx: TenantContext, id: string) {
    const result = await prisma.reservation.updateMany({
      where: { ...branchWhere(ctx), id },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Reservation not found.");
    audit(ctx, { action: "reservations.delete", entityType: "Reservation", entityId: id });
  },

  async createSection(ctx: TenantContext, input: SectionInput) {
    const branchId = requireBranch(ctx);
    const section = await prisma.floorSection.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        name: input.name,
        sortOrder: input.sortOrder,
      },
    });
    audit(ctx, {
      action: "reservations.section.create",
      entityType: "FloorSection",
      entityId: section.id,
      after: section,
    });
    return section;
  },

  async createTable(ctx: TenantContext, input: TableInput) {
    const branchId = requireBranch(ctx);
    const section = await prisma.floorSection.findFirst({
      where: { ...branchWhere(ctx), id: input.sectionId },
    });
    if (!section) throw new DomainError("NOT_FOUND", "Floor section not found.");

    const duplicate = await prisma.diningTable.findFirst({
      where: { branchId, name: input.name, deletedAt: null },
    });
    if (duplicate) {
      throw new DomainError("CONFLICT", "A table with this name already exists.", {
        name: "Already in use",
      });
    }

    const table = await prisma.diningTable.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        sectionId: input.sectionId,
        name: input.name,
        capacity: input.capacity,
      },
    });
    audit(ctx, {
      action: "reservations.table.create",
      entityType: "DiningTable",
      entityId: table.id,
      after: table,
    });
    return table;
  },

  async setTableStatus(ctx: TenantContext, input: TableStatusInput) {
    const result = await prisma.diningTable.updateMany({
      where: { ...branchWhere(ctx), id: input.tableId },
      data: { tableStatus: input.tableStatus },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Table not found.");
    audit(ctx, {
      action: "reservations.table.status",
      entityType: "DiningTable",
      entityId: input.tableId,
      after: { tableStatus: input.tableStatus },
    });
  },
};
