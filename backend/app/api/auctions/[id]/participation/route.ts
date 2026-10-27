import { apiRouteWithParams } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, isDuplicateKey, ok } from "@/lib/http";
import { idParamsSchema } from "@/lib/validation";
import { Auction, AuctionParticipation, Notification, PlatformSettings } from "@/models";

export const POST = apiRouteWithParams({
  auth: "user",
  rateLimit: { scope: "auction-participation", limit: 20 },
  params: idParamsSchema,
  handler: async ({ user, params }) => {
    await connectDB();
    const auction = await Auction.findById(params.id).lean();
    if (!auction) throw new ApiError("Auction not found.", 404, "NOT_FOUND");
    if (auction.sellerId.toString() === user.id) {
      throw new ApiError("Sellers cannot join their own auction.", 403, "SELLER_JOIN_FORBIDDEN");
    }
    if (auction.status === "completed" || auction.status === "cancelled" || auction.endsAt <= new Date()) {
      throw new ApiError("This auction is closed.", 409, "AUCTION_CLOSED");
    }

    const setting = await PlatformSettings.findOne({ key: "auctionRequiresApproval" }).lean();
    const status = setting?.value === true ? "pending" : "approved";

    let participation;
    try {
      participation = await AuctionParticipation.findOneAndUpdate(
        { auctionId: auction._id, userId: user.id },
        { $setOnInsert: { auctionId: auction._id, userId: user.id, status } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      // Concurrent double-clicks can race the unique (auctionId, userId) index.
      if (!isDuplicateKey(error)) throw error;
      participation = await AuctionParticipation.findOne({ auctionId: auction._id, userId: user.id });
    }
    if (!participation) throw new Error("Could not create or load auction participation.");

    if (participation.status === "approved") {
      return ok({ participation: { id: participation._id.toString(), status: participation.status } });
    }

    await Notification.updateOne(
      { userId: user.id, dedupeKey: `participation:${participation._id.toString()}` },
      {
        $setOnInsert: {
          userId: user.id,
          type: "auction_participation",
          title: "Participation request received",
          body: "Your request to join this auction is waiting for review.",
          href: "/auctions",
          dedupeKey: `participation:${participation._id.toString()}`,
        },
      },
      { upsert: true },
    );

    return ok({ participation: { id: participation._id.toString(), status: participation.status } }, 202);
  },
});
