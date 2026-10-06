import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { customerService } from "@/modules/customers/service/customer.service";
import { customerListQuerySchema } from "@/modules/customers/dto/customer.dto";
import { CustomersManager } from "@/modules/customers/components/customers-manager";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomersPage({ searchParams }: Props) {
  const ctx = await requirePermission("customers:view");
  const params = await searchParams;
  const query = customerListQuerySchema.parse({
    page: params.page,
    pageSize: params.pageSize,
    search: typeof params.search === "string" ? params.search : undefined,
    tier: typeof params.tier === "string" ? params.tier : undefined,
  });

  const [{ customers, total }, summary, feedback] = await Promise.all([
    customerService.list(ctx, query),
    customerService.summary(ctx),
    customerService.recentFeedback(ctx),
  ]);

  return (
    <CustomersManager
      customers={customers}
      feedback={feedback}
      summary={summary}
      total={total}
      page={query.page}
      pageSize={query.pageSize}
    />
  );
}
