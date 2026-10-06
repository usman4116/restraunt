import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { reservationService } from "@/modules/reservations/service/reservation.service";
import { reservationListQuerySchema } from "@/modules/reservations/dto/reservation.dto";
import { ReservationsManager } from "@/modules/reservations/components/reservations-manager";

export const metadata: Metadata = { title: "Reservations" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Today as YYYY-MM-DD in server-local time (matches the service day window). */
function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default async function ReservationsPage({ searchParams }: Props) {
  const ctx = await requirePermission("reservations:view");
  const params = await searchParams;
  const query = reservationListQuerySchema.parse({
    date: typeof params.date === "string" ? params.date : undefined,
    status: typeof params.status === "string" ? params.status : undefined,
    search: typeof params.search === "string" ? params.search : undefined,
  });
  const date = query.date ?? today();

  const [reservations, sections, summary] = await Promise.all([
    reservationService.list(ctx, { ...query, date }),
    reservationService.floorPlan(ctx),
    reservationService.summary(ctx, date),
  ]);

  return (
    <ReservationsManager
      reservations={reservations}
      sections={sections}
      summary={summary}
      date={date}
    />
  );
}
