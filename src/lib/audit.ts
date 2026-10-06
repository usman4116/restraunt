import { prisma } from "@/lib/prisma";
import type { TenantContext } from "@/lib/auth/context";

interface AuditInput {
  action: string; // "orders.refund"
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/** Fire-and-forget audit trail write — never blocks or fails the main operation. */
export function audit(ctx: TenantContext, input: AuditInput): void {
  prisma.auditLog
    .create({
      data: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        userId: ctx.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before === undefined ? undefined : JSON.parse(JSON.stringify(input.before)),
        after: input.after === undefined ? undefined : JSON.parse(JSON.stringify(input.after)),
      },
    })
    .catch((e) => console.error("[audit] write failed", e));
}
