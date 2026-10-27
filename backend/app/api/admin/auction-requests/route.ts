import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { AuctionRequest } from "@/models";

export const GET = apiRoute({
  auth: "admin",
  handler: async () => {
    await connectDB();
    const requests = await AuctionRequest.find({ status: { $in: ["pending_review", "approved", "changes_requested"] } })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate<{ sellerId: { name?: string; email?: string } | null }>("sellerId", "name email")
      .lean();

    return ok({
      requests: requests.map((request) => ({
        id: request._id.toString(),
        title: request.title,
        description: request.description,
        category: request.category,
        images: request.images,
        startingPriceCoins: request.startingPriceCoins,
        startsAt: request.startsAt,
        durationHours: request.durationHours,
        shippingInfo: request.shippingInfo,
        status: request.status,
        adminNote: request.adminNote,
        feeAmountMinor: request.feeAmountMinor,
        feeCurrency: request.feeCurrency,
        feePaid: Boolean(request.feePaymentId),
        seller: request.sellerId
          ? { name: request.sellerId.name || "Seller", email: request.sellerId.email || "" }
          : null,
      })),
    });
  },
});
