import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { apiRoute } from "@/lib/api";
import { createSession, setSessionCookie, toPublicUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/security";
import { passwordResetConfirmSchema } from "@/lib/validation";
import { AuthToken, Session, User } from "@/models";

const INVALID_CODE = "That code is invalid or has expired. Request a new code.";
const MAX_ATTEMPTS = 5;

function hashesMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Consumes a reset code, replaces the password, revokes every existing session,
 * and signs the user in with a fresh session. A code works exactly once and
 * only within its 60-second lifetime.
 */
export const POST = apiRoute({
  auth: "public",
  rateLimit: { scope: "password-reset-confirm", limit: 12, by: "ip" },
  body: passwordResetConfirmSchema,
  handler: async ({ request, body }) => {
    await enforceRateLimit("password-reset-confirm-account", body.email, 8, 60);

    await connectDB();
    const user = await User.findOne({ email: body.email, status: "active" });
    if (!user) throw new ApiError(INVALID_CODE, 400, "INVALID_RESET_CODE");

    const token = await AuthToken.findOne({
      userId: user._id,
      purpose: "password_reset",
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .select("+tokenHash");

    if (!token || !token.tokenHash) throw new ApiError(INVALID_CODE, 400, "INVALID_RESET_CODE");

    const expected = sha256(`${user._id.toString()}:password_reset:${body.code}`);
    if (!hashesMatch(expected, token.tokenHash)) {
      token.attempts = (token.attempts || 0) + 1;
      // Burn the code after five misses so six digits cannot be brute-forced.
      if (token.attempts >= MAX_ATTEMPTS) token.consumedAt = new Date();
      await token.save();
      throw new ApiError(INVALID_CODE, 400, "INVALID_RESET_CODE");
    }

    // Atomic consume closes the race between two simultaneous confirm requests.
    const consumed = await AuthToken.findOneAndUpdate(
      { _id: token._id, consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
      { new: true },
    );
    if (!consumed) throw new ApiError(INVALID_CODE, 400, "INVALID_RESET_CODE");

    const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
    const passwordHash = await bcrypt.hash(body.password, rounds);
    const updates: Record<string, unknown> = { passwordHash };
    if (!user.emailVerifiedAt) updates.emailVerifiedAt = new Date();
    await User.updateOne({ _id: user._id }, { $set: updates });

    // A password change invalidates every device, including a stolen session.
    await Session.deleteMany({ userId: user._id });
    await AuthToken.deleteMany({ userId: user._id, purpose: "password_reset", _id: { $ne: token._id } });

    const { token: sessionToken, expiresAt } = await createSession(user._id.toString(), request);
    const response = ok({ user: toPublicUser(user), sessionsRevoked: true });
    setSessionCookie(response, sessionToken, expiresAt);
    return response;
  },
});
