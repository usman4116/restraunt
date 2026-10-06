import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { settingsService } from "@/modules/settings/service/settings.service";
import { auditQuerySchema } from "@/modules/settings/dto/settings.dto";
import { AuditLogTable } from "@/modules/settings/components/audit-log-table";

export const metadata: Metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const ctx = await requirePermission("audit:view");
  const entries = await settingsService.auditTrail(ctx, auditQuerySchema.parse({ limit: 200 }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          The 200 most recent recorded actions across this organization.
        </p>
      </div>
      <AuditLogTable entries={entries} />
    </div>
  );
}
