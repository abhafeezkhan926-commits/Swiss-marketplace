import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { Auction, AuctionRequest, ContentReport, LiveStream, Order, Payment, Product, User, WalletTransaction } from "@/models";

export const GET = apiRoute({
  auth: "admin",
  handler: async () => {
    await connectDB();
    const [users, products, live, auctions, pendingAuctionRequests, orders, payments, reports, openDisputes, coinTotals] =
      await Promise.all([
        User.countDocuments(),
        Product.countDocuments({ status: "published" }),
        LiveStream.countDocuments({ status: "live" }),
        Auction.countDocuments({ status: { $in: ["active", "scheduled"] } }),
        AuctionRequest.countDocuments({ status: "pending_review" }),
        Order.countDocuments(),
        Payment.countDocuments(),
        ContentReport.countDocuments({ status: "open" }),
        Order.countDocuments({ status: "disputed" }),
        WalletTransaction.aggregate([
          { $match: { status: "completed" } },
          { $group: { _id: "$type", total: { $sum: "$amountCoins" } } },
        ]),
      ]);

    return ok({
      stats: { users, products, live, auctions, pendingAuctionRequests, orders, payments, reports, openDisputes },
      coinLedgerTotals: coinTotals.map((entry) => ({ type: entry._id, total: entry.total })),
    });
  },
});
