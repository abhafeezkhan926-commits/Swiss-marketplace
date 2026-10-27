import mongoose from "mongoose";
import { apiRouteWithParams } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, isDuplicateKey, ok } from "@/lib/http";
import { adminAuctionReviewSchema, idParamsSchema } from "@/lib/validation";
import { Auction, AuctionRequest, AuditLog, Notification } from "@/models";

export const PATCH = apiRouteWithParams({
  auth: "admin",
  rateLimit: { scope: "admin-auction-review", limit: 60 },
  params: idParamsSchema,
  body: adminAuctionReviewSchema,
  handler: async ({ user: admin, params, body }) => {
    await connectDB();
    const item = await AuctionRequest.findById(params.id);
    if (!item) throw new ApiError("Auction request not found.", 404, "NOT_FOUND");
    if (item.status === "published") {
      throw new ApiError("This auction request has already been published.", 409, "ALREADY_PUBLISHED");
    }

    item.status = body.status;
    item.adminNote = body.adminNote;
    item.reviewedBy = new mongoose.Types.ObjectId(admin.id);
    item.reviewedAt = new Date();

    if (body.status === "approved") {
      const fee = Number(process.env.AUCTION_FEE_AMOUNT_MINOR ?? 500);
      const currency = (process.env.AUCTION_FEE_CURRENCY || "chf").toLowerCase();
      if (!Number.isSafeInteger(fee) || fee < 0) {
        throw new ApiError(
          "AUCTION_FEE_AMOUNT_MINOR must be zero or a positive integer in minor currency units.",
          500,
          "INVALID_FEE_CONFIG",
        );
      }
      if (!/^[a-z]{3}$/.test(currency)) {
        throw new ApiError("AUCTION_FEE_CURRENCY must be a 3-letter currency code.", 500, "INVALID_FEE_CONFIG");
      }
      item.feeAmountMinor = fee;
      item.feeCurrency = currency;

      if (fee === 0) {
        const alreadyPublished = await Auction.findOne({ requestId: item._id }).lean();
        if (!alreadyPublished) {
          const now = Date.now();
          const startsAt = item.startsAt.getTime() > now + 60_000 ? item.startsAt : new Date(now + 10 * 60_000);
          const endsAt = new Date(startsAt.getTime() + item.durationHours * 60 * 60 * 1000);
          try {
            await Auction.create({
              requestId: item._id,
              sellerId: item.sellerId,
              title: item.title,
              description: item.description,
              category: item.category,
              images: item.images,
              startingPriceCoins: item.startingPriceCoins,
              currentHighestBidCoins: 0,
              startsAt,
              endsAt,
              status: "scheduled",
              shippingInfo: item.shippingInfo,
            });
          } catch (error) {
            // Preserve idempotency if another reviewer request published it concurrently.
            if (!isDuplicateKey(error)) throw error;
          }
        }
        item.status = "published";
      }
    }

    await item.save();

    const bodyText =
      item.status === "published"
        ? "Your auction request was published without a fee under the current development configuration."
        : body.status === "approved"
          ? "Your auction request was approved. Pay the publishing fee in the Auctions page to schedule the listing."
          : body.status === "rejected"
            ? `Your auction request was rejected.${body.adminNote ? ` Note: ${body.adminNote}` : ""}`
            : `Your auction request needs changes.${body.adminNote ? ` Note: ${body.adminNote}` : ""}`;

    const reviewDedupeKey = `auction-review:${item._id.toString()}:${item.status}:${item.updatedAt?.getTime() || Date.now()}`;
    await Notification.updateOne(
      { userId: item.sellerId, dedupeKey: reviewDedupeKey },
      {
        $setOnInsert: {
          userId: item.sellerId,
          type: "auction_review",
          title:
            item.status === "published"
              ? "Auction published"
              : body.status === "approved"
                ? "Auction request approved"
                : "Auction request reviewed",
          body: bodyText,
          href: "/auctions",
          dedupeKey: reviewDedupeKey,
        },
      },
      { upsert: true },
    );

    await AuditLog.create({
      actorId: admin.id,
      action: `auction_request_${body.status}`,
      entityType: "AuctionRequest",
      entityId: item._id.toString(),
      reason: body.adminNote,
      metadata: { feeAmountMinor: item.feeAmountMinor, feeCurrency: item.feeCurrency },
    });

    return ok({
      request: {
        id: item._id.toString(),
        status: item.status,
        feeAmountMinor: item.feeAmountMinor,
        feeCurrency: item.feeCurrency,
        feePaid: Boolean(item.feePaymentId),
      },
    });
  },
});
