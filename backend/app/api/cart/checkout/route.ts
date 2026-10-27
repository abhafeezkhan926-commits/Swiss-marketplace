import crypto from "node:crypto";
import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { purchaseProducts } from "@/lib/purchase";
import { Cart } from "@/models";

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "cart-checkout", limit: 20 },
  handler: async ({ user, request }) => {
    if (user.isTestAccount && process.env.NODE_ENV === "production") {
      throw new ApiError("Demo accounts cannot be used for purchases.", 403, "TEST_ACCOUNT_PURCHASE_DISABLED");
    }

    await connectDB();
    const cart = await Cart.findOne({ userId: user.id }).lean();
    if (!cart || cart.items.length === 0) throw new ApiError("Your cart is empty.", 409, "CART_EMPTY");

    const lines = cart.items.map((item) => ({ productId: item.productId.toString(), quantity: item.quantity }));
    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim() || `product-order:${user.id}:${crypto.randomUUID()}`;

    const purchase = await purchaseProducts({ buyerId: user.id, lines, idempotencyKey });
    await Cart.updateOne({ userId: user.id }, { $set: { items: [] } });

    return ok({ purchase }, 201);
  },
});
