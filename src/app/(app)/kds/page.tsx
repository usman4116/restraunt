import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { KdsBoard } from "@/modules/orders/components/kds-board";

export const metadata: Metadata = { title: "Kitchen Display" };
export const dynamic = "force-dynamic";

export default async function KdsPage() {
  await requirePermission("kds:view");
  return <KdsBoard />;
}
