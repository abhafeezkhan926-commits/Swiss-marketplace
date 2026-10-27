import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { Wallet } from "@/models";

export const GET = apiRoute({
  auth: "optional",
  handler: async ({ user }) => {
    if (!user) return ok({ user: null });
    await connectDB();
    const wallet = await Wallet.findOne({ userId: user.id }).lean();
    return ok({
      user,
      wallet: wallet
        ? {
            availableCoins: wallet.availableCoins,
            reservedCoins: wallet.reservedCoins,
            testCoinsTotal: wallet.testCoinsTotal,
          }
        : null,
    });
  },
});
