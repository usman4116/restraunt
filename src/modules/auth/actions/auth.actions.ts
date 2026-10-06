"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { guard, err, type Result } from "@/lib/result";
import { rateLimit } from "@/lib/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";
import { registerOrgSchema, loginSchema } from "../dto/auth.dto";
import { registerOrganization, authenticate } from "../service/auth.service";

async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function registerAction(raw: unknown): Promise<Result<{ redirectTo: string }>> {
  const parsed = registerOrgSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Please fix the errors below.", zodFields(parsed.error));

  const meta = await requestMeta();
  return guard(async () => {
    await rateLimit("register", meta.ipAddress ?? "unknown", 5, 3600);
    const claims = await registerOrganization(parsed.data);
    await createSession(claims, meta);
    return { redirectTo: "/dashboard" };
  });
}

export async function loginAction(raw: unknown): Promise<Result<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Please fix the errors below.", zodFields(parsed.error));

  const meta = await requestMeta();
  return guard(async () => {
    await rateLimit("login", `${meta.ipAddress ?? "unknown"}:${parsed.data.email}`, 10, 900);
    const claims = await authenticate(parsed.data, meta);
    await createSession(claims, meta);
    return { redirectTo: "/dashboard" };
  });
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
