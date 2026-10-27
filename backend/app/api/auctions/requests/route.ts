import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { AuctionRequest } from "@/models";

export const GET = apiRoute({
  auth: "user",
  handler: async ({ user }) => {
    await connectDB();
    const requests = await AuctionRequest.find({ sellerId: user.id }).sort({ createdAt: -1 }).limit(50).lean();
    return ok({
      requests: requests.map((request) => ({
        id: request._id.toString(),
        title: request.title,
        status: request.status,
        feeAmountMinor: request.feeAmountMinor,
        feeCurrency: request.feeCurrency,
        feePaid: Boolean(request.feePaymentId),
        startsAt: request.startsAt,
        adminNote: request.adminNote,
        createdAt: request.createdAt,
      })),
    });
  },
});
