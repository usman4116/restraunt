// Key-value abstraction: Redis when REDIS_URL is set, in-memory fallback otherwise.
// The in-memory store is per-process and suitable only for local development.
import Redis from "ioredis";
import { env } from "./env";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
}

class MemoryStore implements KeyValueStore {
  private data = new Map<string, { value: string; expiresAt: number | null }>();

  private live(key: string) {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    this.data.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string) {
    this.data.delete(key);
  }

  async incr(key: string, ttlSeconds?: number) {
    const current = Number(this.live(key)?.value ?? "0") + 1;
    const existing = this.live(key);
    this.data.set(key, {
      value: String(current),
      expiresAt: existing?.expiresAt ?? (ttlSeconds ? Date.now() + ttlSeconds * 1000 : null),
    });
    return current;
  }
}

class RedisStore implements KeyValueStore {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  }

  get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) await this.client.set(key, value, "EX", ttlSeconds);
    else await this.client.set(key, value);
  }

  async del(key: string) {
    await this.client.del(key);
  }

  async incr(key: string, ttlSeconds?: number) {
    const value = await this.client.incr(key);
    if (value === 1 && ttlSeconds) await this.client.expire(key, ttlSeconds);
    return value;
  }
}

const globalForKv = globalThis as unknown as { kv?: KeyValueStore };

export const kv: KeyValueStore =
  globalForKv.kv ?? (env.REDIS_URL ? new RedisStore(env.REDIS_URL) : new MemoryStore());

globalForKv.kv = kv;

/** Cache a JSON-serializable computation. */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = await kv.get(key);
  if (hit !== null) return JSON.parse(hit) as T;
  const value = await fn();
  await kv.set(key, JSON.stringify(value), ttlSeconds);
  return value;
}
