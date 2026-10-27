import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { currentUser, requireAdmin, requireUser, type PublicUser } from "@/lib/auth";
import { ApiError, fail, getClientIp, readJson, withNoStore } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Small middleware layer for App Router handlers. Every route composes auth,
 * rate limiting, params/query/body validation, error handling, and no-store
 * headers through this module instead of re-implementing them inline.
 */

export type AuthMode = "public" | "optional" | "user" | "admin";

type UserFor<A extends AuthMode> = A extends "user" | "admin" ? PublicUser : PublicUser | null;

export type RateLimitOptions = {
  scope: string;
  limit: number;
  windowSeconds?: number;
  /** Defaults to the signed-in user, falling back to the client IP. */
  by?: "auto" | "ip" | "user";
};

export type ApiContext<TBody, TQuery, TParams, A extends AuthMode> = {
  request: NextRequest;
  user: UserFor<A>;
  body: TBody;
  query: TQuery;
  params: TParams;
  ip: string;
  requestId: string;
};

export type ApiOptions<TBody, TQuery, TParams, A extends AuthMode> = {
  auth?: A;
  rateLimit?: RateLimitOptions;
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
  params?: ZodType<TParams>;
  handler: (context: ApiContext<TBody, TQuery, TParams, A>) => Promise<Response> | Response;
};

type RouteContext = { params?: Promise<unknown> } | undefined;

function safeRequestId(request: NextRequest): string {
  const incoming = request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9._-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
}

async function execute<TBody, TQuery, TParams, A extends AuthMode>(
  request: NextRequest,
  context: RouteContext,
  options: ApiOptions<TBody, TQuery, TParams, A>,
  fallbackParams: TParams,
): Promise<Response> {
  const requestId = safeRequestId(request);
  const ip = getClientIp(request);

  const authMode = options.auth ?? "public";
  let user: PublicUser | null = null;
  if (authMode === "user") user = await requireUser();
  else if (authMode === "admin") user = await requireAdmin();
  else if (authMode === "optional") user = await currentUser();

  if (options.rateLimit) {
    const { scope, limit, windowSeconds, by = "auto" } = options.rateLimit;
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new ApiError("Rate limit configuration is invalid.", 500, "INVALID_SERVER_CONFIG");
    }
    const identifier = by === "ip" || !user ? ip : user.id;
    await enforceRateLimit(scope, identifier, limit, windowSeconds);
  }

  const rawQuery = Object.fromEntries(request.nextUrl.searchParams);
  const query = options.query ? options.query.parse(rawQuery) : (undefined as TQuery);

  const body = options.body ? await readJson(request, options.body) : (undefined as TBody);

  let params = fallbackParams;
  if (options.params) {
    const rawParams = context?.params ? await context.params : {};
    const parsed = options.params.safeParse(rawParams);
    if (!parsed.success) throw new ApiError("The requested resource was not found.", 404, "NOT_FOUND");
    params = parsed.data;
  } else if (context?.params) {
    params = (await context.params) as TParams;
  }

  const response = await options.handler({
    request,
    user: user as UserFor<A>,
    body,
    query,
    params,
    ip,
    requestId,
  });

  response.headers.set("x-request-id", requestId);
  return withNoStore(response);
}

/** Route handler for fixed paths; no route params are exposed. */
export function apiRoute<TBody = undefined, TQuery = undefined, A extends AuthMode = "public">(
  options: Omit<ApiOptions<TBody, TQuery, Record<string, never>, A>, "params">,
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    try {
      return await execute(request, undefined, options, {} as Record<string, never>);
    } catch (error) {
      return fail(error);
    }
  };
}

/** Route handler for dynamic paths; params are validated before the handler runs. */
export function apiRouteWithParams<
  TParams,
  TBody = undefined,
  TQuery = undefined,
  A extends AuthMode = "public",
>(
  options: ApiOptions<TBody, TQuery, TParams, A> & { params: ZodType<TParams> },
): (request: NextRequest, context: { params: Promise<unknown> }) => Promise<Response> {
  return async (request: NextRequest, context: { params: Promise<unknown> }): Promise<Response> => {
    try {
      return await execute(request, context, options, {} as TParams);
    } catch (error) {
      return fail(error);
    }
  };
}
