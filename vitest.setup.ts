// Unit tests import services, which transitively import src/lib/env.ts — and that
// validates configuration at module load. Vitest does not read .env files on its own,
// so populate process.env before any test module is imported.
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(__dirname, ".env");
if (existsSync(envPath)) loadEnvFile(envPath);

// Fallbacks so a fresh checkout without .env still runs the pure-logic suites.
// NODE_ENV is already "test" — Vitest sets it before loading setup files.
process.env.DATABASE_URL ??= "postgresql://erp:erp@localhost:5432/restaurant_erp_test";
process.env.AUTH_SECRET ??= "test-only-secret-0123456789abcdefghijklmnop";
