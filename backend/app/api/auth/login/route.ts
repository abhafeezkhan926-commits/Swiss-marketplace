import bcrypt from "bcryptjs";
import { apiRoute } from "@/lib/api";
import { createSession, setSessionCookie, toPublicUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { User } from "@/models";

/**
 * A fixed bcrypt hash used when the email does not exist, so failed logins take
 * the same time whether or not an account is present (prevents user enumeration).
 */
const DUMMY_PASSWORD_HASH = "$2b$12$nO7w29Y4QQNV9zeL3yDbEOawx6z4znVmOlf4TPZ6VCqf6R8b3DfiK";

export const POST = apiRoute({
  auth: "public",
  rateLimit: { scope: "auth-login", limit: 10, by: "ip" },
  body: loginSchema,
  handler: async ({ request, body }) => {
    // Per-account throttling complements the per-IP limit above.
    await enforceRateLimit("auth-login-account", body.email, 5);

    await connectDB();
    const user = await User.findOne({ email: body.email }).select("+passwordHash");
    const passwordOk = await bcrypt.compare(body.password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !passwordOk) throw new ApiError("Email or password is incorrect.", 401, "INVALID_CREDENTIALS");
    if (user.status !== "active") throw new ApiError("This account is not currently active.", 403, "ACCOUNT_INACTIVE");

    const { token, expiresAt } = await createSession(user._id.toString(), request);
    const response = ok({ user: toPublicUser(user) });
    setSessionCookie(response, token, expiresAt);
    return response;
  },
});
