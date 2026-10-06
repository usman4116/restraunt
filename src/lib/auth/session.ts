// Cookie-based sessions: signed JWT access token (short-lived) referencing a
// server-side session record (kv + DB) that can be revoked per device.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { env, isProd } from "@/lib/env";
import { kv } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import type { SystemRole } from "@/generated/prisma/client";

const SESSION_COOKIE = "erp_session";
const secret = new TextEncoder().encode(env.AUTH_SECRET);

export interface SessionClaims {
  sessionId: string;
  userId: string;
  organizationId: string | null;
  branchId: string | null;
  systemRole: SystemRole;
  permissions: string[];
}

const sessionKey = (id: string) => `session:${id}`;

export async function createSession(
  claims: Omit<SessionClaims, "sessionId">,
  meta: { userAgent?: string; ipAddress?: string; deviceName?: string } = {},
): Promise<void> {
  const sessionId = nanoid(32);
  const refreshToken = nanoid(48);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

  await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId: claims.userId,
      refreshToken,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      deviceName: meta.deviceName,
    },
  });

  await kv.set(
    sessionKey(sessionId),
    JSON.stringify({ ...claims, refreshToken }),
    env.JWT_REFRESH_TTL,
  );

  const jwt = await new SignJWT({ ...claims, sessionId } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_REFRESH_TTL}s`)
    .sign(secret);

  (await cookies()).set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.JWT_REFRESH_TTL,
  });
}

export async function getSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload: raw } = await jwtVerify(token, secret);
    const payload = raw as unknown as SessionClaims;
    // Server-side revocation check
    const stored = await kv.get(sessionKey(payload.sessionId));
    if (!stored) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const session = await getSession();
  if (session) {
    const stored = await kv.get(sessionKey(session.sessionId));
    if (stored) {
      const { refreshToken } = JSON.parse(stored) as { refreshToken?: string };
      if (refreshToken) {
        await prisma.session.updateMany({
          where: { refreshToken },
          data: { revokedAt: new Date() },
        });
      }
    }
    await kv.del(sessionKey(session.sessionId));
  }
  (await cookies()).delete(SESSION_COOKIE);
}

/** Re-issue session claims (e.g. after branch switch or role change). */
export async function refreshSessionClaims(patch: Partial<SessionClaims>): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const updated = { ...session, ...patch };
  const stored = await kv.get(sessionKey(session.sessionId));
  const refreshToken = stored ? (JSON.parse(stored) as { refreshToken?: string }).refreshToken : undefined;
  await kv.set(
    sessionKey(session.sessionId),
    JSON.stringify({ ...updated, refreshToken }),
    env.JWT_REFRESH_TTL,
  );
  const jwt = await new SignJWT(updated)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_REFRESH_TTL}s`)
    .sign(secret);
  (await cookies()).set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.JWT_REFRESH_TTL,
  });
}
