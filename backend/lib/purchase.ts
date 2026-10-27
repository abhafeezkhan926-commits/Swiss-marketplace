import mongoose from "mongoose";
import { ApiError } from "@/lib/http";
import { coinsForMinor } from "@/lib/wallet";
import { Order, Product, Wallet, WalletTransaction } from "@/models";

export type PurchaseLine = { productId: string; quantity: number };
export type PurchaseResult = { orderIds: string[]; coins: number; amountMinor: number; availableCoins: number };

export async function purchaseProducts(opts: { buyerId: string; lines: PurchaseLine[]; idempotencyKey: string }): Promise<PurchaseResult> {
  const { buyerId, lines, idempotencyKey } = opts;
  if (!lines.length) throw new ApiError("Your cart is empty.", 409, "CART_EMPTY");
  if (lines.length > 50) throw new ApiError("Too many items to purchase at once.", 422, "TOO_MANY_ITEMS");

  const result: { value?: PurchaseResult } = {};
  const tx = await mongoose.startSession();
  try {
    await tx.withTransaction(async () => {
      const products = await Product.find({ _id: { $in: lines.map((line) => line.productId) } }).session(tx);
      const byId = new Map(products.map((product) => [product._id.toString(), product]));

      let amountMinor = 0;
      let coins = 0;
      const prepared: { product: (typeof products)[number]; quantity: number; lineMinor: number; lineCoins: number }[] = [];
      for (const line of lines) {
        const product = byId.get(line.productId);
        if (!product || product.status !== "published") {
          throw new ApiError("A product in your cart is no longer available.", 409, "PRODUCT_UNAVAILABLE");
        }
        if (product.sellerId.toString() === buyerId) {
          throw new ApiError("You cannot buy your own listing.", 403, "SELF_PURCHASE_FORBIDDEN");
        }
        if (product.stock < line.quantity) {
          throw new ApiError(`Only ${product.stock} left in stock for "${product.title}".`, 409, "INSUFFICIENT_STOCK");
        }
        const lineMinor = product.priceMinor * line.quantity;
        const lineCoins = coinsForMinor(lineMinor);
        amountMinor += lineMinor;
        coins += lineCoins;
        prepared.push({ product, quantity: line.quantity, lineMinor, lineCoins });
      }

      const wallet = await Wallet.findOne({ userId: buyerId }).session(tx);
      if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
      if (wallet.availableCoins < coins) {
        throw new ApiError(`You need ${coins} coins for this purchase but only have ${wallet.availableCoins}.`, 409, "INSUFFICIENT_COINS");
      }

      const beforeAvailable = wallet.availableCoins;
      wallet.availableCoins -= coins;
      wallet.spentCoinsTotal += coins;
      await wallet.save({ session: tx });

      const orderIds: string[] = [];
      for (const item of prepared) {
        item.product.stock -= item.quantity;
        await item.product.save({ session: tx });
        const order = await Order.create(
          [
            {
              buyerId,
              sellerId: item.product.sellerId,
              productId: item.product._id,
              quantity: item.quantity,
              amountMinor: item.lineMinor,
              currency: item.product.currency,
              status: "paid",
              idempotencyKey: `${idempotencyKey}:${item.product._id.toString()}`,
            },
          ],
          { session: tx },
        );
        orderIds.push(order[0]._id.toString());
      }

      await WalletTransaction.create(
        [
          {
            userId: buyerId,
            type: "product_debit",
            amountCoins: -coins,
            reservedDelta: 0,
            availableBefore: beforeAvailable,
            availableAfter: wallet.availableCoins,
            reservedBefore: wallet.reservedCoins,
            reservedAfter: wallet.reservedCoins,
            idempotencyKey,
            relatedEntityType: "product_order",
            relatedEntityId: orderIds.join(","),
            metadata: {
              lines: prepared.map((item) => ({
                productId: item.product._id.toString(),
                quantity: item.quantity,
                coins: item.lineCoins,
              })),
            },
          },
        ],
        { session: tx },
      );

      result.value = { orderIds, coins, amountMinor, availableCoins: wallet.availableCoins };
    });
  } finally {
    await tx.endSession();
  }

  if (!result.value) throw new Error("Purchase transaction returned no result.");
  return result.value;
}
