import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { auctionRequestSchema } from "@/lib/validation";
import { Auction, AuctionRequest, Notification } from "@/models";

export const GET = apiRoute({
  auth: "public",
  handler: async () => {
    await connectDB();
    const now = new Date();
    await Auction.updateMany(
      { status: "scheduled", startsAt: { $lte: now }, endsAt: { $gt: now } },
      { $set: { status: "active" } },
    );
    const auctions = await Auction.find({ status: { $in: ["scheduled", "active"] }, endsAt: { $gt: now } })
      .sort({ startsAt: 1 })
      .limit(40)
      .populate("sellerId", "name")
      .lean();

    return ok({
      auctions: auctions.map((auction) => ({
        id: auction._id.toString(),
        title: auction.title,
        description: auction.description,
        category: auction.category,
        images: auction.images,
        startingPriceCoins: auction.startingPriceCoins,
        currentHighestBidCoins: auction.currentHighestBidCoins,
        startsAt: auction.startsAt,
        endsAt: auction.endsAt,
        status: auction.status,
        seller:
          auction.sellerId && typeof auction.sellerId === "object" && "name" in auction.sellerId
            ? auction.sellerId.name
            : "Seller",
      })),
    });
  },
});

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "auction-request", limit: 10 },
  body: auctionRequestSchema,
  handler: async ({ user, body }) => {
    const startsAtMs = new Date(body.startsAt).getTime();
    const now = Date.now();
    if (!Number.isFinite(startsAtMs) || startsAtMs < now + 10 * 60 * 1000) {
      throw new ApiError("Choose a start time at least 10 minutes in the future.", 422, "INVALID_START_TIME");
    }
    if (startsAtMs > now + 90 * 24 * 60 * 60 * 1000) {
      throw new ApiError("Choose a start time within the next 90 days.", 422, "INVALID_START_TIME");
    }

    await connectDB();
    const requestDoc = await AuctionRequest.create({
      ...body,
      sellerId: user.id,
      startsAt: new Date(startsAtMs),
      status: "pending_review",
    });

    await Notification.updateOne(
      { userId: user.id, dedupeKey: `auction-request:${requestDoc._id.toString()}` },
      {
        $setOnInsert: {
          userId: user.id,
          type: "auction_request",
          title: "Auction request submitted",
          body: "Your auction request is awaiting review.",
          href: "/auctions",
          dedupeKey: `auction-request:${requestDoc._id.toString()}`,
        },
      },
      { upsert: true },
    );

    return ok({ request: { id: requestDoc._id.toString(), status: requestDoc.status } }, 201);
  },
});
