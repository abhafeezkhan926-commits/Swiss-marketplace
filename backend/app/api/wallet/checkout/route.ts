import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, isDuplicateKey, ok, requireIdempotencyKey } from "@/lib/http";
import { stripeClient } from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validation";
import { ensureDefaultPackages } from "@/lib/wallet";
import { CoinPackage, Payment } from "@/models";

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "wallet-checkout", limit: 8 },
  body: checkoutSchema,
  handler: async ({ request, user, body }) => {
    const requestKey = requireIdempotencyKey(request);
    await ensureDefaultPackages();
    await connectDB();

    const checkoutKey = `${user.id}:${requestKey}`;
    const existing = await Payment.findOne({ checkoutRequestKey: checkoutKey }).lean();
    if (existing?.checkoutUrl && existing.status === "pending") {
      return ok({ checkoutUrl: existing.checkoutUrl, reused: true });
    }
    if (existing) {
      throw new ApiError("This checkout attempt was already used. Start a new checkout with a fresh key.", 409, "CHECKOUT_KEY_ALREADY_USED");
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new ApiError("Stripe checkout is not configured. Add STRIPE_SECRET_KEY on the server.", 503, "STRIPE_NOT_CONFIGURED");
    }

    const coinPackage = await CoinPackage.findOne({ _id: body.packageId, active: true }).lean();
    if (!coinPackage) throw new ApiError("The selected coin package is no longer available.", 404, "PACKAGE_NOT_FOUND");

    const minAmount = Number(process.env.MIN_TOPUP_AMOUNT_MINOR || 500);
    if (!Number.isSafeInteger(minAmount) || minAmount < 1) {
      throw new ApiError("MIN_TOPUP_AMOUNT_MINOR configuration is invalid.", 500, "INVALID_SERVER_CONFIG");
    }
    if (coinPackage.amountMinor < minAmount) {
      throw new ApiError("This package is below the configured minimum top-up value.", 400, "BELOW_MINIMUM_TOPUP");
    }

    const expectedCurrency = (process.env.COIN_TOPUP_CURRENCY || "usd").toLowerCase();
    if (coinPackage.currency !== expectedCurrency) {
      throw new ApiError(
        "The configured payment currency does not match this package. Ask an administrator to review package pricing.",
        503,
        "CURRENCY_CONFIGURATION_MISMATCH",
      );
    }
    if (user.isTestAccount) {
      throw new ApiError("The demo account uses test credits and cannot start real payment checkout.", 403, "TEST_ACCOUNT_REAL_PAYMENT_DISABLED");
    }

    let paymentId = "";
    try {
      const payment = await Payment.create({
        userId: user.id,
        packageId: coinPackage._id,
        paymentType: "coin_topup",
        amountMinor: coinPackage.amountMinor,
        currency: coinPackage.currency,
        coins: coinPackage.coins,
        status: "pending",
        checkoutRequestKey: checkoutKey,
      });
      paymentId = payment._id.toString();
    } catch (error) {
      // Concurrent retry with the same Idempotency-Key: return the winning session.
      if (isDuplicateKey(error)) {
        const duplicate = await Payment.findOne({ checkoutRequestKey: checkoutKey }).lean();
        if (duplicate?.checkoutUrl && duplicate.status === "pending") {
          return ok({ checkoutUrl: duplicate.checkoutUrl, reused: true });
        }
        throw new ApiError("This checkout attempt was already used. Start a new checkout with a fresh key.", 409, "CHECKOUT_KEY_ALREADY_USED");
      }
      throw error;
    }

    try {
      const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const stripe = stripeClient();
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          allowed_payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: coinPackage.currency,
                unit_amount: coinPackage.amountMinor,
                product_data: {
                  name: `${coinPackage.coins.toLocaleString()} Marketplace Coins`,
                  description: "Marketplace credit. Not withdrawable as cash.",
                },
              },
              quantity: 1,
            },
          ],
          client_reference_id: user.id,
          metadata: {
            paymentId,
            paymentType: "coin_topup",
            userId: user.id,
            packageId: coinPackage._id.toString(),
            coins: String(coinPackage.coins),
          },
          success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/checkout/cancelled`,
        },
        { idempotencyKey: `market-checkout-${paymentId}` },
      );
      if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
      await Payment.updateOne({ _id: paymentId }, { $set: { providerSessionId: session.id, checkoutUrl: session.url } });
      return ok({ checkoutUrl: session.url, paymentId }, 201);
    } catch (error) {
      await Payment.updateOne(
        { _id: paymentId },
        { $set: { status: "failed", failureReason: "Checkout session creation failed." } },
      );
      throw error;
    }
  },
});
