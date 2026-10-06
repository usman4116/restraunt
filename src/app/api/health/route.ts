import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kv } from "@/lib/cache";

export async function GET() {
  const checks: Record<string, "ok" | "fail"> = { app: "ok", db: "fail", kv: "fail" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    // db unreachable
  }

  try {
    await kv.set("health:ping", "1", 10);
    checks.kv = (await kv.get("health:ping")) === "1" ? "ok" : "fail";
  } catch {
    // kv unreachable
  }

  const healthy = Object.values(checks).every((c) => c === "ok");
  return NextResponse.json(
    { ok: healthy, checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
