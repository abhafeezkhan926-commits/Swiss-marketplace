import { apiRouteWithParams } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { idParamsSchema } from "@/lib/validation";
import { LiveStream } from "@/models";

export const PATCH = apiRouteWithParams({
  auth: "user",
  rateLimit: { scope: "live-update", limit: 20 },
  params: idParamsSchema,
  handler: async ({ user, params }) => {
    await connectDB();
    const stream = await LiveStream.findById(params.id);
    if (!stream) throw new ApiError("Stream not found.", 404, "NOT_FOUND");
    if (stream.sellerId.toString() !== user.id && user.role !== "admin") {
      throw new ApiError("You cannot manage this stream.", 403, "FORBIDDEN");
    }

    if (stream.status !== "ended") {
      stream.status = "ended";
      stream.endedAt = new Date();
      await stream.save();
    }

    return ok({ stream: { id: stream._id.toString(), status: stream.status, endedAt: stream.endedAt } });
  },
});
