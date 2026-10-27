import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { Payment, Wallet, WalletTransaction } from "@/models";

export const GET = apiRoute({
  auth: "user",
  handler: async ({ user }) => {
    await connectDB();
    const wallet = await Wallet.findOne({ userId: user.id }).lean();
    const transactions = await WalletTransaction.find({ userId: user.id }).sort({ createdAt: -1 }).limit(25).lean();
    const payments = await Payment.find({ userId: user.id })
      .select("amountMinor currency coins status createdAt paidAt")
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    return ok({
      wallet: wallet
        ? {
            availableCoins: wallet.availableCoins,
            reservedCoins: wallet.reservedCoins,
            purchasedCoinsTotal: wallet.purchasedCoinsTotal,
            testCoinsTotal: wallet.testCoinsTotal,
            spentCoinsTotal: wallet.spentCoinsTotal,
          }
        : { availableCoins: 0, reservedCoins: 0, purchasedCoinsTotal: 0, testCoinsTotal: 0, spentCoinsTotal: 0 },
      isTestAccount: user.isTestAccount,
      transactions: transactions.map((tx) => ({
        id: tx._id.toString(),
        type: tx.type,
        amountCoins: tx.amountCoins,
        reservedDelta: tx.reservedDelta,
        availableBefore: tx.availableBefore,
        availableAfter: tx.availableAfter,
        reservedBefore: tx.reservedBefore,
        reservedAfter: tx.reservedAfter,
        status: tx.status,
        relatedEntityType: tx.relatedEntityType,
        createdAt: tx.createdAt,
      })),
      payments: payments.map((payment) => ({
        id: payment._id.toString(),
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        coins: payment.coins,
        status: payment.status,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt,
      })),
    });
  },
});
