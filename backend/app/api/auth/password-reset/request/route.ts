import { randomInt } from "node:crypto";
import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { RESET_CODE_TTL_SECONDS, sendPasswordResetCode } from "@/lib/email";
import { ok } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/security";
import { passwordResetRequestSchema } from "@/lib/validation";
import { AuthToken, User } from "@/models";

/**
 * Issues a six-digit, single-use password reset code. The response is generic
 * so it cannot be used to discover which email addresses have an account.
 * Codes expire after 60 seconds and a second code cannot be minted until the
 * first one has expired.
 */
export const POST = apiRoute({
  auth: "public",
  rateLimit: { scope: "password-reset-request", limit: 6, by: "ip" },
  body: passwordResetRequestSchema,
  handler: async ({ body }) => {
    await enforceRateLimit("password-reset-request-account", body.email, 1, RESET_CODE_TTL_SECONDS);

    await connectDB();
    const user = await User.findOne({ email: body.email, status: "active" }).select("_id email").lean();
    if (!user) return ok({ accepted: true, expiresInSeconds: RESET_CODE_TTL_SECONDS });

    const recent = await AuthToken.findOne({
      userId: user._id,
      purpose: "password_reset",
      consumedAt: null,
      createdAt: { $gt: new Date(Date.now() - (RESET_CODE_TTL_SECONDS - 5) * 1000) },
    })
      .select("_id")
      .lean();
    if (recent) return ok({ accepted: true, expiresInSeconds: RESET_CODE_TTL_SECONDS });

    // Only the newest code is valid; a reset request replaces earlier attempts.
    await AuthToken.deleteMany({ userId: user._id, purpose: "password_reset" });

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const tokenHash = sha256(`${user._id.toString()}:password_reset:${code}`);
    await AuthToken.create({
      userId: user._id,
      tokenHash,
      purpose: "password_reset",
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_SECONDS * 1000),
    });

    let delivery: Awaited<ReturnType<typeof sendPasswordResetCode>>;
    try {
      delivery = await sendPasswordResetCode(body.email, code);
    } catch (error) {
      // Never leave a usable code behind when the email could not be delivered.
      await AuthToken.deleteOne({ tokenHash });
      throw error;
    }

    return ok({
      accepted: true,
      expiresInSeconds: RESET_CODE_TTL_SECONDS,
      delivery: delivery.provider === "console" ? "development" : "email",
      ...(delivery.provider === "console" ? { devCode: code } : {}),
    });
  },
});
