import { apiRouteWithParams } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, isDuplicateKey, ok, requireIdempotencyKey } from "@/lib/http";
import { stripeClient } from "@/lib/stripe";
import { idParamsSchema } from "@/lib/validation";
import { AuctionRequest, Payment } from "@/models";

export const POST = apiRouteWithParams({
  auth: "user",
  rateLimit: { scope: "auction-fee-checkout", limit: 5 },
  params: idParamsSchema,
  handler: async ({ request, user, params }) => {
    if (user.isTestAccount) {
      throw new ApiError("Demo accounts cannot make real auction-fee payments.", 403, "TEST_ACCOUNT_PAYMENT_DISABLED");
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new ApiError("Stripe checkout is not configured. Add STRIPE_SECRET_KEY on the server.", 503, "STRIPE_NOT_CONFIGURED");
    }

    await connectDB();
    const item = await AuctionRequest.findById(params.id);
    if (!item) throw new ApiError("Auction request not found.", 404, "NOT_FOUND");
    if (item.sellerId.toString() !== user.id) {
      throw new ApiError("Only the seller can pay this auction fee.", 403, "FORBIDDEN");
    }
    if (item.status !== "approved") {
      throw new ApiError("This request must be approved before a publishing fee can be paid.", 409, "REQUEST_NOT_APPROVED");
    }
    if (item.feePaymentId) {
      throw new ApiError("This request already has a fee payment reference.", 409, "FEE_ALREADY_LINKED");
    }
    if (!Number.isSafeInteger(item.feeAmountMinor) || item.feeAmountMinor <= 0) {
      throw new ApiError("No valid fee is configured for this request.", 409, "NO_FEE_REQUIRED");
    }

    const pendingPayment = await Payment.findOne({
      userId: user.id,
      paymentType: "auction_fee",
      relatedEntityId: params.id,
      status: "pending",
      checkoutUrl: { $ne: "" },
    }).lean();
    if (pendingPayment?.checkoutUrl) {
      return ok({ checkoutUrl: pendingPayment.checkoutUrl, reused: true });
    }

    const requestKey = requireIdempotencyKey(request);
    const uniqueKey = `${user.id}:auction-fee:${params.id}:${requestKey}`;
    const existing = await Payment.findOne({ checkoutRequestKey: uniqueKey }).lean();
    if (existing?.checkoutUrl && existing.status === "pending") {
      return ok({ checkoutUrl: existing.checkoutUrl, reused: true });
    }
    if (existing) {
      throw new ApiError("This fee checkout attempt was already used. Start a new attempt.", 409, "CHECKOUT_KEY_ALREADY_USED");
    }

    let paymentId = "";
    try {
      const payment = await Payment.create({
        userId: user.id,
        paymentType: "auction_fee",
        relatedEntityId: params.id,
        amountMinor: item.feeAmountMinor,
        currency: item.feeCurrency,
        coins: 0,
        status: "pending",
        checkoutRequestKey: uniqueKey,
      });
      paymentId = payment._id.toString();
    } catch (error) {
      // The partial unique index allows only one pending fee payment per request.
      if (isDuplicateKey(error)) {
        const pending = await Payment.findOne({
          userId: user.id,
          paymentType: "auction_fee",
          relatedEntityId: params.id,
          status: "pending",
        }).lean();
        if (pending?.checkoutUrl) return ok({ checkoutUrl: pending.checkoutUrl, reused: true });
        throw new ApiError("A fee checkout is already being prepared. Try again shortly.", 409, "FEE_CHECKOUT_IN_PROGRESS");
      }
      throw error;
    }

    try {
      const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const session = await stripeClient().checkout.sessions.create(
        {
          mode: "payment",
          allowed_payment_method_types: ["card"],
          client_reference_id: user.id,
          line_items: [
            {
              price_data: {
                currency: item.feeCurrency,
                unit_amount: item.feeAmountMinor,
                product_data: {
                  name: `Auction publishing fee: ${item.title}`,
                  description: "Marketplace listing review and scheduling fee.",
                },
              },
              quantity: 1,
            },
          ],
          metadata: {
            paymentId,
            paymentType: "auction_fee",
            userId: user.id,
            relatedEntityId: params.id,
          },
          success_url: `${base}/checkout/success?kind=auction_fee`,
          cancel_url: `${base}/checkout/cancelled?kind=auction_fee`,
        },
        { idempotencyKey: `auction-fee-${paymentId}` },
      );
      if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
      await Payment.updateOne({ _id: paymentId }, { $set: { providerSessionId: session.id, checkoutUrl: session.url } });
      return ok({ checkoutUrl: session.url, paymentId }, 201);
    } catch (error) {
      await Payment.updateOne(
        { _id: paymentId },
        { $set: { status: "failed", failureReason: "Auction fee checkout creation failed." } },
      );
      throw error;
    }
  },
});
