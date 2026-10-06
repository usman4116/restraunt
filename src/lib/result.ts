// Result type used by every service. Actions serialize it verbatim to the client.

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface AppError {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = <T = never>(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): Result<T> => ({ ok: false, error: { code, message, fields } });

export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }

  toResult<T = never>(): Result<T> {
    return err(this.code, this.message, this.fields);
  }
}

/** Wrap a service call: DomainError → typed result, anything else → INTERNAL. */
export async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof DomainError) return e.toResult();
    console.error("[internal-error]", e);
    return err("INTERNAL", "Something went wrong. Please try again.");
  }
}
