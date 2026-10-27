import { AccessToken } from "livekit-server-sdk";
import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { liveKitTokenSchema } from "@/lib/validation";
import { LiveStream } from "@/models";

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "livekit-token", limit: 30 },
  body: liveKitTokenSchema,
  handler: async ({ user, body }) => {
    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      throw new ApiError("LiveKit is not configured on the server.", 503, "LIVEKIT_NOT_CONFIGURED");
    }

    await connectDB();
    const stream = await LiveStream.findOne({ roomName: body.roomName }).lean();
    if (!stream) throw new ApiError("Stream not found.", 404, "STREAM_NOT_FOUND");

    const isSeller = stream.sellerId.toString() === user.id;
    if (body.publish && !isSeller) {
      throw new ApiError("Only this stream's seller can publish audio/video.", 403, "PUBLISH_FORBIDDEN");
    }
    if (!body.publish && stream.status !== "live" && !isSeller) {
      throw new ApiError("This stream is not live.", 409, "STREAM_NOT_LIVE");
    }

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: user.id,
      name: user.name,
      ttl: "10m",
    });
    token.addGrant({
      roomJoin: true,
      room: stream.roomName,
      canPublish: body.publish && isSeller,
      canSubscribe: true,
      canPublishData: true,
    });

    return ok({ token: await token.toJwt(), serverUrl: LIVEKIT_URL, roomName: stream.roomName });
  },
});
