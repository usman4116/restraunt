import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { hrService } from "@/modules/hr/service/hr.service";
import { hrListQuerySchema } from "@/modules/hr/dto/hr.dto";
import { HrManager } from "@/modules/hr/components/hr-manager";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Current month as YYYY-MM in server-local time (matches the service window). */
function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function HrPage({ searchParams }: Props) {
  const ctx = await requirePermission("employees:view");
  const params = await searchParams;
  const query = hrListQuerySchema.parse({
    month: typeof params.month === "string" ? params.month : undefined,
    department: typeof params.department === "string" ? params.department : undefined,
    search: typeof params.search === "string" ? params.search : undefined,
  });
  const month = query.month ?? thisMonth();

  const [employees, attendance, leaveRequests, shifts, payrollRuns, summary] = await Promise.all([
    hrService.employees(ctx, query),
    hrService.attendance(ctx, { ...query, month }),
    hrService.leaveRequests(ctx),
    hrService.shifts(ctx),
    hrService.payrollRuns(ctx),
    hrService.summary(ctx, month),
  ]);

  return (
    <HrManager
      employees={employees}
      attendance={attendance}
      leaveRequests={leaveRequests}
      shifts={shifts}
      payrollRuns={payrollRuns}
      summary={summary}
      month={month}
    />
  );
}
