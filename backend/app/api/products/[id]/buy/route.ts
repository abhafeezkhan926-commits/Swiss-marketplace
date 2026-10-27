import crypto from "node:crypto";
import { apiRouteWithParams } from "@/lib/api";
import { ApiError, ok } from "@/lib/http";
import { purchaseProducts } from "@/lib/purchase";
import { productBuySchema, idParamsSchema } from "@/lib/validation";

export const POST = apiRouteWithParams({
  auth: "user",
  rateLimit: { scope: "product-buy", limit: 30 },
  params: idParamsSchema,
  body: productBuySchema,
  handler: async ({ user, request, params, body }) => {
    if (user.isTestAccount && process.env.NODE_ENV === "production") {
      throw new ApiError("Demo accounts cannot be used for purchases.", 403, "TEST_ACCOUNT_PURCHASE_DISABLED");
    }

    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim() ||
      `product-order:${user.id}:${params.id}:${crypto.randomUUID()}`;

    const purchase = await purchaseProducts({
      buyerId: user.id,
      lines: [{ productId: params.id, quantity: body.quantity }],
      idempotencyKey,
    });

    return ok({ purchase }, 201);
  },
});
