import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { ensureDefaultPackages, formatPrice } from "@/lib/wallet";
import { CoinPackage } from "@/models";

export const GET = apiRoute({
  auth: "public",
  handler: async () => {
    await ensureDefaultPackages();
    await connectDB();
    const docs = await CoinPackage.find({ active: true }).sort({ sortOrder: 1 }).lean();
    return ok({
      packages: docs.map((item) => ({
        id: item._id.toString(),
        code: item.code,
        coins: item.coins,
        amountMinor: item.amountMinor,
        currency: item.currency,
        priceLabel: formatPrice(item.amountMinor, item.currency),
        description: item.description,
      })),
      minTopUpMinor: Number(process.env.MIN_TOPUP_AMOUNT_MINOR || 500),
      currency: (process.env.COIN_TOPUP_CURRENCY || "usd").toLowerCase(),
    });
  },
});
