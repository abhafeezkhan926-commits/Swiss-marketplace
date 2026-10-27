import bcrypt from "bcryptjs";
import { apiRoute } from "@/lib/api";
import { createSession, setSessionCookie, toPublicUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { ApiError, isDuplicateKey, ok } from "@/lib/http";
import { registerSchema } from "@/lib/validation";
import { User, Wallet } from "@/models";
import type { UserDocument } from "@/models";

export const POST = apiRoute({
  auth: "public",
  rateLimit: { scope: "auth-register", limit: 5, by: "ip" },
  body: registerSchema,
  handler: async ({ request, body }) => {
    await connectDB();
    const existing = await User.findOne({ email: body.email }).select("_id").lean();
    if (existing) throw new ApiError("An account with this email already exists.", 409, "EMAIL_EXISTS");

    const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
    const passwordHash = await bcrypt.hash(body.password, rounds);

    let user: UserDocument;
    try {
      user = await User.create({ name: body.name, email: body.email, passwordHash, role: "user", status: "active" });
    } catch (error) {
      // Handles the race where two registrations pass the findOne check together.
      if (isDuplicateKey(error)) throw new ApiError("An account with this email already exists.", 409, "EMAIL_EXISTS");
      throw error;
    }

    try {
      await Wallet.create({ userId: user._id, availableCoins: 0, reservedCoins: 0 });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }

    const { token, expiresAt } = await createSession(user._id.toString(), request);
    const response = ok({ user: toPublicUser(user) }, 201);
    setSessionCookie(response, token, expiresAt);
    return response;
  },
});
