import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { profileUpdateSchema } from "@/lib/validation";
import { User } from "@/models";

export const GET = apiRoute({
  auth: "user",
  handler: async ({ user }) => ok({ user }),
});

export const PATCH = apiRoute({
  auth: "user",
  rateLimit: { scope: "profile-update", limit: 20 },
  body: profileUpdateSchema,
  handler: async ({ user, body }) => {
    await connectDB();
    const updated = await User.findByIdAndUpdate(user.id, { $set: body }, { new: true, runValidators: true });
    if (!updated) throw new ApiError("User not found.", 404, "NOT_FOUND");

    return ok({
      user: {
        id: updated._id.toString(),
        name: updated.name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        theme: updated.theme,
        accent: updated.accent,
        avatarUrl: updated.avatarUrl,
        isTestAccount: updated.isTestAccount,
      },
    });
  },
});
