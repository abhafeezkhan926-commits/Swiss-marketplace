import { NextResponse, type NextRequest } from "next/server";

/**
 * Network-level guard for every /api route.
 * Runs before route handlers on the Node.js runtime (Next.js 16 proxy convention).
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;
const REQUEST_ID = /^[A-Za-z0-9._-]{8,100}$/;

function clampNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function allowedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin]);
  const appOrigin = normalizeOrigin(process.env.APP_URL);
  if (appOrigin) origins.add(appOrigin);
  for (const entry of (process.env.ALLOWED_ORIGINS || "").split(",")) {
    const origin = normalizeOrigin(entry.trim());
    if (origin) origins.add(origin);
  }
  return origins;
}

function isAllowedOrigin(request: NextRequest, origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (allowedOrigins(request).has(normalized)) return true;
  return process.env.NODE_ENV !== "production" && LOCAL_ORIGIN.test(normalized);
}

function bodyLimitBytes(pathname: string): number {
  if (pathname === "/api/uploads") {
    const maxMb = clampNumber(process.env.MAX_UPLOAD_MB, 12, 1, 50);
    return maxMb * 1024 * 1024 + 1024 * 1024; // multipart envelope overhead
  }
  if (pathname === "/api/webhooks/stripe") return 2 * 1024 * 1024;
  return clampNumber(process.env.MAX_JSON_BODY_KB, 1024, 16, 5120) * 1024;
}

function applyHeaders(
  response: NextResponse,
  request: NextRequest,
  requestId: string,
  origin: string | null,
  originAllowed: boolean,
): NextResponse {
  const headers = response.headers;
  headers.set("x-request-id", requestId);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-dns-prefetch-control", "off");
  headers.set("x-permitted-cross-domain-policies", "none");
  headers.set("cache-control", "no-store");
  headers.set(
    "content-security-policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (process.env.NODE_ENV === "production" && (request.nextUrl.protocol === "https:" || forwardedProto === "https")) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }

  const normalized = normalizeOrigin(origin);
  if (originAllowed && normalized && normalized !== request.nextUrl.origin) {
    headers.set("access-control-allow-origin", normalized);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }

  return response;
}

function jsonError(message: string, code: string, status: number, requestId: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: { message, code } },
    { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}

export function proxy(request: NextRequest): NextResponse {
  const incomingId = request.headers.get("x-request-id")?.trim() || "";
  const requestId = REQUEST_ID.test(incomingId) ? incomingId : crypto.randomUUID();
  const method = request.method.toUpperCase();
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const originAllowed = Boolean(origin && isAllowedOrigin(request, origin));

  if (!ALLOWED_METHODS.has(method)) {
    return applyHeaders(
      jsonError("This HTTP method is not allowed.", "METHOD_NOT_ALLOWED", 405, requestId),
      request,
      requestId,
      origin,
      originAllowed,
    );
  }

  if (method === "OPTIONS") {
    if (origin && !originAllowed) {
      return applyHeaders(
        jsonError("This origin is not allowed to call the API.", "ORIGIN_NOT_ALLOWED", 403, requestId),
        request,
        requestId,
        origin,
        false,
      );
    }
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("allow", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set("access-control-allow-methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set(
      "access-control-allow-headers",
      "Content-Type, Idempotency-Key, Stripe-Signature, X-Request-Id, Authorization",
    );
    response.headers.set("access-control-max-age", "600");
    return applyHeaders(response, request, requestId, origin, originAllowed);
  }

  if (MUTATING_METHODS.has(method)) {
    if (origin && !originAllowed) {
      return applyHeaders(
        jsonError("This origin is not allowed to call the API.", "ORIGIN_NOT_ALLOWED", 403, requestId),
        request,
        requestId,
        origin,
        false,
      );
    }
    if (!origin && request.headers.get("sec-fetch-site") === "cross-site") {
      return applyHeaders(
        jsonError("Cross-site requests are not allowed.", "CSRF_BLOCKED", 403, requestId),
        request,
        requestId,
        origin,
        false,
      );
    }
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  const limit = bodyLimitBytes(pathname);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    return applyHeaders(
      jsonError(`Request body must be at most ${Math.round(limit / 1024)} KB.`, "BODY_TOO_LARGE", 413, requestId),
      request,
      requestId,
      origin,
      originAllowed,
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return applyHeaders(response, request, requestId, origin, originAllowed);
}

export const config = {
  matcher: ["/api/:path*"],
};
