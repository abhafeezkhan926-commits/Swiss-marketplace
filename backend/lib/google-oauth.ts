import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { ApiError } from "@/lib/http";

export const GOOGLE_OAUTH_COOKIE = "swiss_google_oauth";
const GOOGLE_COOKIE_PATH = "/api/auth/google";
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

export function appBaseUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function googleOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new ApiError("Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.", 503, "GOOGLE_NOT_CONFIGURED");
  }
  const configuredRedirect = (process.env.GOOGLE_REDIRECT_URI || "").trim();
  const redirectUri = (configuredRedirect || `${appBaseUrl()}/api/auth/google/callback`).replace(/\/+$/, "");
  return { clientId, clientSecret, redirectUri };
}

export function createOAuthState() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function verifyOAuthState(cookieValue: string | undefined, providedState: string | null): { verifier: string } | null {
  if (!cookieValue || !providedState) return null;
  const separator = cookieValue.indexOf(".");
  if (separator < 1) return null;
  const expectedState = cookieValue.slice(0, separator);
  const verifier = cookieValue.slice(separator + 1);
  if (verifier.length < 20 || verifier.length > 200) return null;
  const left = Buffer.from(expectedState);
  const right = Buffer.from(providedState);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return { verifier };
}

export function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: GOOGLE_COOKIE_PATH,
    maxAge: GOOGLE_STATE_TTL_SECONDS,
  };
}

export function clearGoogleOAuthCookie(response: NextResponse) {
  response.cookies.set(GOOGLE_OAUTH_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0, expires: new Date(0) });
  return response;
}

export function googleErrorRedirect(code: string) {
  const response = NextResponse.redirect(`${appBaseUrl()}/login?error=${encodeURIComponent(code)}`);
  return clearGoogleOAuthCookie(response);
}

export async function verifyGoogleIdToken(idToken: string, clientId: string) {
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new ApiError("Google did not return a verified email address.", 401, "GOOGLE_EMAIL_UNVERIFIED");
  }
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
    throw new ApiError("Google token issuer is invalid.", 401, "GOOGLE_TOKEN_INVALID");
  }
  return payload;
}
