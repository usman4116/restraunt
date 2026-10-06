import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { aiInsightsService } from "@/modules/ai/service/insights.service";
import { nlQuerySchema } from "@/modules/ai/dto/ai.dto";
import { AiManager } from "@/modules/ai/components/ai-manager";

export const metadata: Metadata = { title: "AI Insights" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AiPage({ searchParams }: Props) {
  const ctx = await requirePermission("reports:view");
  const params = await searchParams;

  // Parse natural-language query if present.
  const q = typeof params.q === "string" ? params.q : null;
  const nlQuery = q ? aiInsightsService.nlQuery(ctx, q) : null;

  // Load all insights in parallel.
  const [forecast, inventoryPredictions, digest] = await Promise.all([
    aiInsightsService.salesForecast(ctx, { horizonDays: 7 }),
    aiInsightsService.inventoryPredictions(ctx),
    aiInsightsService.dailyDigest(ctx),
  ]);

  return (
    <AiManager
      forecast={forecast}
      inventoryPredictions={inventoryPredictions}
      digest={digest}
      nlQuery={nlQuery}
    />
  );
}
