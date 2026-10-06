import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { deliveryService } from "@/modules/delivery/service/delivery.service";
import { deliveryListQuerySchema } from "@/modules/delivery/dto/delivery.dto";
import { DeliveryManager } from "@/modules/delivery/components/delivery-manager";

export const metadata: Metadata = { title: "Delivery" };
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

export default async function DeliveryPage({ searchParams }: Props) {
  const ctx = await requirePermission("delivery:view");
  const params = await searchParams;
  const query = deliveryListQuerySchema.parse({
    date: typeof params.date === "string" ? params.date : undefined,
    deliveryStatus: typeof params.status === "string" ? params.status : undefined,
    riderId: typeof params.rider === "string" ? params.rider : undefined,
    search: typeof params.search === "string" ? params.search : undefined,
  });
  const date = query.date ?? today();

  const [deliveries, riders, zones, summary] = await Promise.all([
    deliveryService.list(ctx, { ...query, date }),
    deliveryService.riders(ctx),
    deliveryService.zones(ctx),
    deliveryService.summary(ctx, date),
  ]);

  return (
    <DeliveryManager
      deliveries={deliveries}
      riders={riders}
      zones={zones}
      summary={summary}
      date={date}
    />
  );
}
