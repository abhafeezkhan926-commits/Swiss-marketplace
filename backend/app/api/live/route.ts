import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { liveCreateSchema } from "@/lib/validation";
import { LiveStream, Product } from "@/models";

export const GET = apiRoute({
  auth: "optional",
  handler: async ({ user }) => {
    await connectDB();
    const streams = await LiveStream.find({ status: "live" })
      .sort({ startedAt: -1 })
      .limit(40)
      .populate("sellerId", "name")
      .lean();

    return ok({
      streams: streams.map((stream) => {
        const sellerRef = stream.sellerId as unknown;
        const isPopulated =
          Boolean(sellerRef) && typeof sellerRef === "object" && "name" in (sellerRef as object);
        const sellerId = isPopulated
          ? String((sellerRef as { _id: unknown })._id)
          : String(sellerRef ?? "");

        return {
          id: stream._id.toString(),
          roomName: stream.roomName,
          title: stream.title,
          thumbnailUrl: stream.thumbnailUrl || "",
          productIds: stream.productIds.map(String),
          status: stream.status,
          startedAt: stream.startedAt,
          seller: isPopulated ? (sellerRef as { name: string }).name : "Seller",
          isOwner: Boolean(user && sellerId === user.id),
        };
      }),
    });
  },
});

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "live-create", limit: 5 },
  body: liveCreateSchema,
  handler: async ({ user, body }) => {
    if (user.isTestAccount) {
      throw new ApiError("Demo accounts cannot start public streams.", 403, "TEST_ACCOUNT_STREAM_DISABLED");
    }

    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      throw new ApiError("LiveKit is not configured on the server.", 503, "LIVEKIT_NOT_CONFIGURED");
    }

    await connectDB();
    if (body.productIds.length > 0) {
      const ownedProducts = await Product.countDocuments({
        _id: { $in: body.productIds },
        sellerId: user.id,
        status: "published",
      });
      if (ownedProducts !== body.productIds.length) {
        throw new ApiError(
          "Every linked product must be one of your published products.",
          422,
          "INVALID_PRODUCT_REFERENCE",
        );
      }
    }

    const active = await LiveStream.findOne({ sellerId: user.id, status: "live" }).lean();
    if (active) throw new ApiError("End your current livestream before starting another.", 409, "STREAM_ALREADY_ACTIVE");

    const roomName = `seller-${user.id.slice(-8)}-${Date.now().toString(36)}`;
    const stream = await LiveStream.create({
      sellerId: user.id,
      roomName,
      title: body.title,
      thumbnailUrl: body.thumbnailUrl,
      productIds: body.productIds,
      status: "live",
      startedAt: new Date(),
    });

    return ok(
      { stream: { id: stream._id.toString(), roomName: stream.roomName, title: stream.title, status: stream.status } },
      201,
    );
  },
});
