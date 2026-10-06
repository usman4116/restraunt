"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { aiInsightsService } from "../service/insights.service";
import { forecastQuerySchema, nlQuerySchema } from "../dto/ai.dto";
import type {
  SalesForecastResult,
  InventoryPredictionResult,
  DailyDigest,
  NlQueryResult,
} from "../dto/ai.dto";
import type { Result } from "@/lib/result";

// ── sales forecast ────────────────────────────────────────────────────────────

export async function getSalesForecastAction(
  _prev: unknown,
  formData: FormData
): Promise<Result<SalesForecastResult>> {
  try {
    const ctx = await requirePermission("reports:view");
    const parsed = forecastQuerySchema.safeParse({
      horizonDays: formData.get("horizonDays"),
      branchId: formData.get("branchId") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } };
    }
    const result = await aiInsightsService.salesForecast(ctx, parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("FORBIDDEN")) return { ok: false, error: { code: "FORBIDDEN", message: msg } };
    if (msg.includes("UNAUTHENTICATED")) return { ok: false, error: { code: "UNAUTHENTICATED", message: msg } };
    return { ok: false, error: { code: "INTERNAL", message: msg } };
  }
}

// ── inventory predictions ─────────────────────────────────────────────────────

export async function getInventoryPredictionsAction(): Promise<Result<InventoryPredictionResult>> {
  try {
    const ctx = await requirePermission("inventory:view");
    const result = await aiInsightsService.inventoryPredictions(ctx);
    return { ok: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("FORBIDDEN")) return { ok: false, error: { code: "FORBIDDEN", message: msg } };
    if (msg.includes("UNAUTHENTICATED")) return { ok: false, error: { code: "UNAUTHENTICATED", message: msg } };
    return { ok: false, error: { code: "INTERNAL", message: msg } };
  }
}

// ── daily digest ──────────────────────────────────────────────────────────────

export async function getDailyDigestAction(): Promise<Result<DailyDigest>> {
  try {
    const ctx = await requirePermission("reports:view");
    const result = await aiInsightsService.dailyDigest(ctx);
    return { ok: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("FORBIDDEN")) return { ok: false, error: { code: "FORBIDDEN", message: msg } };
    if (msg.includes("UNAUTHENTICATED")) return { ok: false, error: { code: "UNAUTHENTICATED", message: msg } };
    return { ok: false, error: { code: "INTERNAL", message: msg } };
  }
}

// ── natural-language query ────────────────────────────────────────────────────

export async function nlQueryAction(
  _prev: unknown,
  formData: FormData
): Promise<Result<NlQueryResult>> {
  try {
    const ctx = await requirePermission("reports:view");
    const parsed = nlQuerySchema.safeParse({ q: formData.get("q") });
    if (!parsed.success) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } };
    }
    const result = aiInsightsService.nlQuery(ctx, parsed.data.q);
    revalidatePath("/ai");
    return { ok: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("FORBIDDEN")) return { ok: false, error: { code: "FORBIDDEN", message: msg } };
    if (msg.includes("UNAUTHENTICATED")) return { ok: false, error: { code: "UNAUTHENTICATED", message: msg } };
    return { ok: false, error: { code: "INTERNAL", message: msg } };
  }
}
