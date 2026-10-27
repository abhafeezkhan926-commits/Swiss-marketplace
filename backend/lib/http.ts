import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MIN_JSON_BODY_KB = 16;
const MAX_JSON_BODY_KB = 5120;

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: NO_STORE });
}

export function withNoStore<T extends Response>(response: T): T {
  if (!response.headers.has("cache-control")) response.headers.set("cache-control", "no-store");
  return response;
}

export function isDuplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: { message: error.message, code: error.code } },
      { status: error.status, headers: NO_STORE },
    );
  }

  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: fields[0]?.message || "Please check the submitted fields.",
          code: "VALIDATION_ERROR",
          fields,
        },
      },
      { status: 422, headers: NO_STORE },
    );
  }

  // Defensive fallbacks for database errors that should normally be caught by schema validation.
  if (error && typeof error === "object") {
    const name = (error as { name?: string }).name;
    if (name === "ValidationError") {
      const issues = ((error as { errors?: Record<string, { message?: string }> }).errors || {});
      const fields = Object.entries(issues).map(([path, issue]) => ({
        path,
        message: issue.message || "Invalid value.",
      }));
      return NextResponse.json(
        {
          ok: false,
          error: {
            message: fields[0]?.message || "Please check the submitted fields.",
            code: "VALIDATION_ERROR",
            fields,
          },
        },
        { status: 422, headers: NO_STORE },
      );
    }
    if (name === "CastError") {
      return NextResponse.json(
        { ok: false, error: { message: "Invalid identifier.", code: "INVALID_IDENTIFIER" } },
        { status: 400, headers: NO_STORE },
      );
    }
  }

  if (isDuplicateKey(error)) {
    return NextResponse.json(
      { ok: false, error: { message: "This value is already in use.", code: "DUPLICATE_VALUE" } },
      { status: 409, headers: NO_STORE },
    );
  }

  if (process.env.NODE_ENV !== "production") console.error("API error:", error);
  return NextResponse.json(
    { ok: false, error: { message: "Unexpected server error.", code: "INTERNAL_ERROR" } },
    { status: 500, headers: NO_STORE },
  );
}

function jsonBodyLimitBytes(): number {
  const configured = Number(process.env.MAX_JSON_BODY_KB || 1024);
  const kilobytes = Number.isFinite(configured)
    ? Math.min(MAX_JSON_BODY_KB, Math.max(MIN_JSON_BODY_KB, Math.floor(configured)))
    : 1024;
  return kilobytes * 1024;
}

function hasJsonContentType(request: Request): boolean {
  const contentType = (request.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
  return contentType === "application/json" || Boolean(contentType?.endsWith("+json"));
}

async function readTextWithLimit(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(`Request body must be at most ${Math.round(maxBytes / 1024)} KB.`, 413, "BODY_TOO_LARGE");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ApiError(`Request body must be at most ${Math.round(maxBytes / 1024)} KB.`, 413, "BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Could not read the request body.", 400, "INVALID_BODY");
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new ApiError("Request body must be valid UTF-8.", 400, "INVALID_BODY");
  }
}

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  if (!hasJsonContentType(request)) {
    throw new ApiError("Send this request body as application/json.", 415, "UNSUPPORTED_MEDIA_TYPE");
  }
  const text = await readTextWithLimit(request, jsonBodyLimitBytes());
  if (!text.trim()) throw new ApiError("Request body is required.", 400, "EMPTY_BODY");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError("Request body must be valid JSON.", 400, "INVALID_JSON");
  }
  return schema.parse(body);
}

/** Returns a validated Idempotency-Key header or throws a consistent 400 error. */
export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim() || "";
  if (!key) throw new ApiError("An Idempotency-Key header is required.", 400, "IDEMPOTENCY_KEY_REQUIRED");
  if (key.length < 8 || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new ApiError("Idempotency-Key must be 8-200 printable characters.", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  return key;
}

/**
 * Reads the first forwarded address, strips IPv4 ports/brackets, and bounds the
 * length so an attacker cannot stuff arbitrary data into rate-limit identifiers.
 * Deployment note: trust x-forwarded-for only behind a proxy that overwrites it.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  const first = forwarded.split(",")[0]?.trim() || "";
  if (!first) return "unknown";
  const unbracketed = first.startsWith("[") && first.endsWith("]") ? first.slice(1, -1) : first;
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;
  const normalized = unbracketed.replace(ipv4WithPort, "$1");
  return normalized.length > 0 && normalized.length <= 64 ? normalized : "unknown";
}
