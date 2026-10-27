import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { newOpaqueToken, sha256, safeUserAgent } from "@/lib/security";
import { Session, User, type UserDocument } from "@/models";

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "swiss_market_session";
export const SESSION_DAYS = Math.min(Math.max(Number(process.env.SESSION_TTL_DAYS || 7), 1), 30);

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  isTestAccount: boolean;
  avatarUrl?: string;
  theme: "light" | "dark";
  accent: string;
};

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(), name: user.name, email: user.email,
    role: user.role, status: user.status, isTestAccount: Boolean(user.isTestAccount),
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}), theme: user.theme, accent: user.accent,
  };
}

export async function createSession(userId: string, request: Request): Promise<{ token: string; expiresAt: Date }> {
  await connectDB();
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await Session.create({ userId, tokenHash: sha256(token), expiresAt, userAgent: safeUserAgent(request) });
  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    expires: expiresAt, maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(0), maxAge: 0 });
}

export async function currentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  // Opaque tokens are 43 chars today; reject absurd values before hashing/querying.
  if (!token || token.length < 20 || token.length > 200) return null;
  await connectDB();
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  const user = await User.findById(session.userId);
  if (!user || user.status !== "active") return null;
  return toPublicUser(user);
}

export async function requireUser(): Promise<PublicUser> {
  const user = await currentUser();
  if (!user) throw new ApiError("Sign in to continue.", 401, "UNAUTHENTICATED");
  return user;
}

/**
 * Admin surfaces deliberately behave like a missing page for everyone else.
 * Returning 404 instead of 401/403 avoids advertising that privileged
 * endpoints exist and matches the server-rendered /admin page gate.
 */
export async function requireAdmin(): Promise<PublicUser> {
  const user = await currentUser();
  if (!user || user.role !== "admin") {
    throw new ApiError("The requested resource was not found.", 404, "NOT_FOUND");
  }
  return user;
}
