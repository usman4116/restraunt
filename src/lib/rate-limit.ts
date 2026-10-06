import { kv } from "@/lib/cache";
import { DomainError } from "@/lib/result";

/** Fixed-window rate limiter backed by the KV store. Throws RATE_LIMITED when exceeded. */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const count = await kv.incr(`rl:${bucket}:${identifier}`, windowSeconds);
  if (count > limit) {
    throw new DomainError("RATE_LIMITED", "Too many attempts. Please try again later.");
  }
}
