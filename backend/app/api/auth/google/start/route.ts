import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import {
  GOOGLE_OAUTH_COOKIE,
  createOAuthState,
  googleErrorRedirect,
  googleOAuthConfig,
  oauthCookieOptions,
} from "@/lib/google-oauth";

export const runtime = "nodejs";

export const GET = apiRoute({
  auth: "public",
  rateLimit: { scope: "google-oauth-start", limit: 20, by: "ip" },
  handler: async () => {
    let config;
    try {
      config = googleOAuthConfig();
    } catch {
      return googleErrorRedirect("google_not_configured");
    }

    const { state, verifier, challenge } = createOAuthState();
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("client_id", config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("prompt", "select_account");

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(GOOGLE_OAUTH_COOKIE, `${state}.${verifier}`, oauthCookieOptions());
    return response;
  },
});
