import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { apiRoute } from "@/lib/api";
import { createSession, setSessionCookie } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import {
  GOOGLE_OAUTH_COOKIE,
  appBaseUrl,
  clearGoogleOAuthCookie,
  googleErrorRedirect,
  googleOAuthConfig,
  verifyGoogleIdToken,
  verifyOAuthState,
} from "@/lib/google-oauth";
import { isDuplicateKey } from "@/lib/http";
import { User, Wallet } from "@/models";

export const runtime = "nodejs";

export const GET = apiRoute({
  auth: "public",
  rateLimit: { scope: "google-oauth-callback", limit: 20, by: "ip" },
  handler: async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("error")) return googleErrorRedirect("google_cancelled");

    let config;
    try {
      config = googleOAuthConfig();
    } catch {
      return googleErrorRedirect("google_not_configured");
    }

    const code = url.searchParams.get("code");
    const verifiedState = verifyOAuthState(
      request.cookies.get(GOOGLE_OAUTH_COOKIE)?.value,
      url.searchParams.get("state"),
    );
    if (!code || !verifiedState) return googleErrorRedirect("google_state_invalid");

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
          code_verifier: verifiedState.verifier,
        }),
        cache: "no-store",
      });
      const tokens = (await tokenResponse.json()) as { id_token?: string };
      if (!tokenResponse.ok || !tokens.id_token) throw new Error("Google token exchange failed.");

      const profile = await verifyGoogleIdToken(tokens.id_token, config.clientId);
      const email = profile.email!.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return googleErrorRedirect("google_failed");
      }
      const name = (profile.name || email.split("@")[0]).trim().slice(0, 80) || "Marketplace user";

      await connectDB();
      let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email }] });
      if (!user) {
        try {
          const configuredRounds = Number(process.env.BCRYPT_ROUNDS || 12);
          const rounds = Number.isFinite(configuredRounds) ? Math.min(14, Math.max(10, configuredRounds)) : 12;
          user = await User.create({
            name,
            email,
            passwordHash: await bcrypt.hash(randomBytes(32).toString("base64url"), rounds),
            role: "user",
            status: "active",
            isTestAccount: false,
            googleId: profile.sub,
            emailVerifiedAt: new Date(),
          });
        } catch (error) {
          if (!isDuplicateKey(error)) throw error;
          user = await User.findOne({ email });
          if (!user) throw error;
        }
      }

      if (user.status !== "active") return googleErrorRedirect("account_suspended");
      if (user.googleId && user.googleId !== profile.sub) {
        return googleErrorRedirect("google_account_conflict");
      }

      const updates: Record<string, unknown> = {};
      if (!user.googleId) updates.googleId = profile.sub;
      if (!user.emailVerifiedAt) updates.emailVerifiedAt = new Date();
      if (Object.keys(updates).length) await User.updateOne({ _id: user._id }, { $set: updates });

      try {
        await Wallet.updateOne(
          { userId: user._id },
          { $setOnInsert: { availableCoins: 0, reservedCoins: 0, purchasedCoinsTotal: 0, testCoinsTotal: 0, spentCoinsTotal: 0 } },
          { upsert: true },
        );
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }

      const session = await createSession(user._id.toString(), request);
      const response = NextResponse.redirect(`${appBaseUrl()}/`);
      setSessionCookie(response, session.token, session.expiresAt);
      return clearGoogleOAuthCookie(response);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.error("Google OAuth error:", error);
      return googleErrorRedirect("google_failed");
    }
  },
});
