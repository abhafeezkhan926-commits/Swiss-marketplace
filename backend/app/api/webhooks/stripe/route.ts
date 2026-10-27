import mongoose from "mongoose";
import type Stripe from "stripe";
import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, isDuplicateKey, ok } from "@/lib/http";
import { stripeClient } from "@/lib/stripe";
import { Auction, AuctionRequest, Notification, Payment, Wallet, WalletTransaction, WebhookEvent } from "@/models";

export const runtime = "nodejs";

export const POST = apiRoute({
  auth: "public",
  handler: async ({ request }) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
      throw new ApiError("Stripe webhook is not configured.", 400, "WEBHOOK_NOT_CONFIGURED");
    }

    let event: Stripe.Event;
    try {
      const body = await request.text();
      if (!body) throw new Error("Empty webhook body.");
      event = stripeClient().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new ApiError("Invalid Stripe webhook signature.", 400, "INVALID_SIGNATURE");
    }

    try {
      await connectDB();
      const mongoSession = await mongoose.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          if (await WebhookEvent.findOne({ eventId: event.id }).session(mongoSession).lean()) return;

          const supported = [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
            "checkout.session.async_payment_failed",
            "checkout.session.expired",
          ];

          if (supported.includes(event.type)) {
            const checkout = event.data.object as Stripe.Checkout.Session;
            const payment = await Payment.findOne({ providerSessionId: checkout.id }).session(mongoSession);

            if (payment) {
              if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
                if (payment.status === "pending") {
                  payment.status = event.type === "checkout.session.expired" ? "cancelled" : "failed";
                  payment.failureReason = event.type;
                  await payment.save({ session: mongoSession });
                }
              } else if (checkout.payment_status === "paid" && payment.status !== "succeeded") {
                const validBase =
                  checkout.amount_total === payment.amountMinor &&
                  (checkout.currency || "").toLowerCase() === payment.currency.toLowerCase() &&
                  checkout.metadata?.paymentId === payment._id.toString() &&
                  checkout.metadata?.userId === payment.userId.toString() &&
                  checkout.metadata?.paymentType === payment.paymentType &&
                  checkout.client_reference_id === payment.userId.toString();

                const validType =
                  payment.paymentType === "coin_topup"
                    ? Boolean(
                        payment.packageId &&
                          payment.coins > 0 &&
                          checkout.metadata?.packageId === payment.packageId.toString() &&
                          checkout.metadata?.coins === String(payment.coins),
                      )
                    : payment.paymentType === "auction_fee"
                      ? Boolean(payment.relatedEntityId && checkout.metadata?.relatedEntityId === payment.relatedEntityId)
                      : false;

                if (validBase && validType) {
                  if (payment.paymentType === "coin_topup") {
                    const wallet = await Wallet.findOne({ userId: payment.userId }).session(mongoSession);
                    if (!wallet) throw new Error(`Wallet is missing for user ${payment.userId.toString()}`);
                    const availableBefore = wallet.availableCoins;
                    const reservedBefore = wallet.reservedCoins;
                    wallet.availableCoins += payment.coins;
                    wallet.purchasedCoinsTotal += payment.coins;
                    await wallet.save({ session: mongoSession });

                    payment.status = "succeeded";
                    payment.paidAt = new Date();
                    payment.providerPaymentIntentId =
                      typeof checkout.payment_intent === "string" ? checkout.payment_intent : "";
                    await payment.save({ session: mongoSession });

                    await WalletTransaction.create(
                      [
                        {
                          userId: payment.userId,
                          type: "topup",
                          amountCoins: payment.coins,
                          reservedDelta: 0,
                          availableBefore,
                          availableAfter: wallet.availableCoins,
                          reservedBefore,
                          reservedAfter: wallet.reservedCoins,
                          status: "completed",
                          idempotencyKey: `stripe:checkout:${checkout.id}`,
                          relatedEntityType: "payment",
                          relatedEntityId: payment._id.toString(),
                          metadata: {
                            provider: "stripe",
                            currency: payment.currency,
                            amountMinor: payment.amountMinor,
                          },
                        },
                      ],
                      { session: mongoSession },
                    );

                    await Notification.updateOne(
                      { userId: payment.userId, dedupeKey: `payment-success:${payment._id.toString()}` },
                      {
                        $setOnInsert: {
                          userId: payment.userId,
                          type: "wallet_topup",
                          title: "Coins added successfully",
                          body: `${payment.coins.toLocaleString()} coins were added to your wallet.`,
                          href: "/wallet",
                          dedupeKey: `payment-success:${payment._id.toString()}`,
                        },
                      },
                      { upsert: true, session: mongoSession },
                    );
                  } else if (payment.paymentType === "auction_fee") {
                    payment.status = "succeeded";
                    payment.paidAt = new Date();
                    payment.providerPaymentIntentId =
                      typeof checkout.payment_intent === "string" ? checkout.payment_intent : "";
                    await payment.save({ session: mongoSession });

                    const item = await AuctionRequest.findOne({
                      _id: payment.relatedEntityId,
                      sellerId: payment.userId,
                      status: "approved",
                    }).session(mongoSession);

                    if (item) {
                      const existingAuction = await Auction.findOne({ requestId: item._id }).session(mongoSession);
                      if (!existingAuction) {
                        const now = Date.now();
                        const startsAt =
                          item.startsAt.getTime() > now + 60_000 ? item.startsAt : new Date(now + 10 * 60_000);
                        const endsAt = new Date(startsAt.getTime() + item.durationHours * 60 * 60 * 1000);
                        await Auction.create(
                          [
                            {
                              requestId: item._id,
                              sellerId: item.sellerId,
                              title: item.title,
                              description: item.description,
                              category: item.category,
                              images: item.images,
                              startingPriceCoins: item.startingPriceCoins,
                              currentHighestBidCoins: 0,
                              startsAt,
                              endsAt,
                              status: "scheduled",
                              shippingInfo: item.shippingInfo,
                            },
                          ],
                          { session: mongoSession },
                        );
                      }
                      item.status = "published";
                      item.feePaymentId = payment._id;
                      await item.save({ session: mongoSession });

                      await Notification.updateOne(
                        { userId: payment.userId, dedupeKey: `auction-published:${item._id.toString()}` },
                        {
                          $setOnInsert: {
                            userId: payment.userId,
                            type: "auction_published",
                            title: "Auction published",
                            body: `Your auction “${item.title}” is scheduled.`,
                            href: "/auctions",
                            dedupeKey: `auction-published:${item._id.toString()}`,
                          },
                        },
                        { upsert: true, session: mongoSession },
                      );
                    } else {
                      // The money was paid, but the request can no longer be auto-published.
                      payment.failureReason =
                        "Payment succeeded, but no matching approved auction request was available for publication. Manual review required.";
                      await payment.save({ session: mongoSession });
                      await Notification.updateOne(
                        { userId: payment.userId, dedupeKey: `auction-fee-review:${payment._id.toString()}` },
                        {
                          $setOnInsert: {
                            userId: payment.userId,
                            type: "payment_review",
                            title: "Auction fee needs review",
                            body: "Your fee payment was received, but the auction could not be published automatically. Contact support for reconciliation.",
                            href: "/auctions",
                            dedupeKey: `auction-fee-review:${payment._id.toString()}`,
                          },
                        },
                        { upsert: true, session: mongoSession },
                      );
                    }
                  }
                } else {
                  // Do not credit coins when any financial reference fails verification.
                  payment.failureReason =
                    "Paid checkout could not be matched to the expected amount, currency, account, or payment type. Admin review required; no coins were credited.";
                  await payment.save({ session: mongoSession });
                  await Notification.updateOne(
                    { userId: payment.userId, dedupeKey: `payment-review:${payment._id.toString()}` },
                    {
                      $setOnInsert: {
                        userId: payment.userId,
                        type: "payment_review",
                        title: "Payment needs review",
                        body: "We received a payment update that could not be matched automatically. No wallet credits were added; contact support.",
                        href: "/wallet",
                        dedupeKey: `payment-review:${payment._id.toString()}`,
                      },
                    },
                    { upsert: true, session: mongoSession },
                  );
                }
              }
            }
          }

          await WebhookEvent.create([{ provider: "stripe", eventId: event.id, eventType: event.type }], {
            session: mongoSession,
          });
        });
      } finally {
        await mongoSession.endSession();
      }
      return ok({ received: true });
    } catch (error) {
      if (isDuplicateKey(error)) return ok({ received: true, duplicate: true });
      throw error;
    }
  },
});
