import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { settingsService } from "@/modules/settings/service/settings.service";
import { auditQuerySchema } from "@/modules/settings/dto/settings.dto";
import { SettingsManager } from "@/modules/settings/components/settings-manager";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requirePermission("settings:view");

  const [organization, branches, users, roles, auditTrail] = await Promise.all([
    settingsService.organization(ctx),
    settingsService.branches(ctx),
    settingsService.users(ctx),
    settingsService.roles(ctx),
    settingsService.auditTrail(ctx, auditQuerySchema.parse({})),
  ]);

  return (
    <SettingsManager
      organization={organization}
      branches={branches}
      users={users}
      roles={roles}
      auditTrail={auditTrail}
      currentUserId={ctx.userId}
    />
  );
}
