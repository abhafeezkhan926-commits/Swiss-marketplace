import mongoose from "mongoose";
import { apiRouteWithParams } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, isDuplicateKey, ok, requireIdempotencyKey } from "@/lib/http";
import { bidSchema, idParamsSchema } from "@/lib/validation";
import { Auction, AuctionParticipation, Bid, Notification, Wallet, WalletTransaction } from "@/models";

export const POST = apiRouteWithParams({
  auth: "user",
  rateLimit: { scope: "auction-bid", limit: 30 },
  params: idParamsSchema,
  body: bidSchema,
  handler: async ({ request, user, params, body }) => {
    if (user.isTestAccount && process.env.NODE_ENV === "production") {
      throw new ApiError("Demo credits cannot be used for production bidding.", 403, "TEST_ACCOUNT_BIDDING_DISABLED");
    }

    const idempotencyKey = requireIdempotencyKey(request);
    const auctionId = params.id;
    await connectDB();

    const existingBid = await Bid.findOne({ idempotencyKey }).lean();
    if (existingBid) {
      if (existingBid.bidderId.toString() !== user.id || existingBid.auctionId.toString() !== auctionId) {
        throw new ApiError("Idempotency key has already been used for another operation.", 409, "IDEMPOTENCY_CONFLICT");
      }
      return ok({
        bid: { id: existingBid._id.toString(), amountCoins: existingBid.amountCoins, acceptedAt: existingBid.acceptedAt },
        reused: true,
      });
    }

    const result: { value?: { bidId: string; amountCoins: number; availableCoins: number; reservedCoins: number } } = {};

    try {
      const tx = await mongoose.startSession();
      try {
        await tx.withTransaction(async () => {
          const auction = await Auction.findById(auctionId).session(tx);
          if (!auction) throw new ApiError("Auction not found.", 404, "NOT_FOUND");

          const now = new Date();
          if (auction.status === "scheduled" && auction.startsAt <= now && auction.endsAt > now) auction.status = "active";
          if (auction.status !== "active" || auction.startsAt > now || auction.endsAt <= now) {
            throw new ApiError("This auction is not accepting bids.", 409, "AUCTION_NOT_ACTIVE");
          }
          if (auction.sellerId.toString() === user.id) {
            throw new ApiError("Sellers cannot bid on their own auction.", 403, "SELLER_BID_FORBIDDEN");
          }

          const participation = await AuctionParticipation.findOne({
            auctionId: auction._id,
            userId: user.id,
            status: "approved",
          })
            .session(tx)
            .lean();
          if (!participation) {
            throw new ApiError("You are not approved to participate in this auction.", 403, "PARTICIPATION_NOT_APPROVED");
          }

          const minBid = Math.max(auction.startingPriceCoins, auction.currentHighestBidCoins + 1);
          if (body.amountCoins < minBid) {
            throw new ApiError(`Your bid must be at least ${minBid} coins.`, 422, "BID_TOO_LOW");
          }

          const wallet = await Wallet.findOne({ userId: user.id }).session(tx);
          if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");

          const previousLeaderId = auction.currentHighestBidder?.toString() || "";
          const previousBid = auction.currentHighestBidCoins;
          let oldLeaderWallet = null;
          if (previousLeaderId && previousLeaderId !== user.id && previousBid > 0) {
            oldLeaderWallet = await Wallet.findOne({ userId: previousLeaderId }).session(tx);
            if (!oldLeaderWallet || oldLeaderWallet.reservedCoins < previousBid) {
              throw new Error("Auction reservation ledger is inconsistent; manual review required.");
            }
          }

          // A leading bidder's previous reservation is released before reserving the new amount.
          const userBeforeAvailable = wallet.availableCoins;
          const userBeforeReserved = wallet.reservedCoins;
          if (previousLeaderId === user.id && previousBid > 0) {
            wallet.reservedCoins -= previousBid;
            wallet.availableCoins += previousBid;
          }
          if (wallet.availableCoins < body.amountCoins) {
            throw new ApiError("Not enough available coins for this bid.", 409, "INSUFFICIENT_COINS");
          }
          wallet.availableCoins -= body.amountCoins;
          wallet.reservedCoins += body.amountCoins;
          await wallet.save({ session: tx });

          if (oldLeaderWallet && previousLeaderId && previousBid > 0) {
            const oldAvail = oldLeaderWallet.availableCoins;
            const oldReserved = oldLeaderWallet.reservedCoins;
            oldLeaderWallet.reservedCoins -= previousBid;
            oldLeaderWallet.availableCoins += previousBid;
            await oldLeaderWallet.save({ session: tx });
            await WalletTransaction.create(
              [
                {
                  userId: previousLeaderId,
                  type: "bid_release",
                  amountCoins: previousBid,
                  reservedDelta: -previousBid,
                  availableBefore: oldAvail,
                  availableAfter: oldLeaderWallet.availableCoins,
                  reservedBefore: oldReserved,
                  reservedAfter: oldLeaderWallet.reservedCoins,
                  idempotencyKey: `auction:${auctionId}:release:${auction._id.toString()}:${previousLeaderId}:${Date.now()}`,
                  relatedEntityType: "auction",
                  relatedEntityId: auctionId,
                },
              ],
              { session: tx },
            );
            const outbidKey = `auction-outbid:${auctionId}:${previousLeaderId}:${body.amountCoins}`;
            await Notification.updateOne(
              { userId: previousLeaderId, dedupeKey: outbidKey },
              {
                $setOnInsert: {
                  userId: previousLeaderId,
                  type: "auction_outbid",
                  title: "You have been outbid",
                  body: `A new bid was placed on ${auction.title}. Your reserved coins are available again.`,
                  href: "/auctions",
                  dedupeKey: outbidKey,
                },
              },
              { upsert: true, session: tx },
            );
          }

          // When this user increases their own leading bid, net available balance only decreases by the increase.
          const reserveDelta = body.amountCoins - (previousLeaderId === user.id ? previousBid : 0);
          await WalletTransaction.create(
            [
              {
                userId: user.id,
                type: "bid_reserve",
                amountCoins: -reserveDelta,
                reservedDelta: reserveDelta,
                availableBefore: userBeforeAvailable,
                availableAfter: wallet.availableCoins,
                reservedBefore: userBeforeReserved,
                reservedAfter: wallet.reservedCoins,
                idempotencyKey: `auction:${auctionId}:bid:${idempotencyKey}`,
                relatedEntityType: "auction",
                relatedEntityId: auctionId,
                metadata: { submittedBidCoins: body.amountCoins },
              },
            ],
            { session: tx },
          );

          auction.currentHighestBidCoins = body.amountCoins;
          auction.currentHighestBidder = new mongoose.Types.ObjectId(user.id);
          auction.status = "active";
          await auction.save({ session: tx });

          const bid = await Bid.create(
            [{ auctionId: auction._id, bidderId: user.id, amountCoins: body.amountCoins, idempotencyKey }],
            { session: tx },
          );

          await Notification.updateOne(
            { userId: auction.sellerId, dedupeKey: `auction-bid:${bid[0]._id.toString()}` },
            {
              $setOnInsert: {
                userId: auction.sellerId,
                type: "auction_bid",
                title: "New auction bid",
                body: `A new bid of ${body.amountCoins} coins was placed on ${auction.title}.`,
                href: "/auctions",
                dedupeKey: `auction-bid:${bid[0]._id.toString()}`,
              },
            },
            { upsert: true, session: tx },
          );

          result.value = {
            bidId: bid[0]._id.toString(),
            amountCoins: body.amountCoins,
            availableCoins: wallet.availableCoins,
            reservedCoins: wallet.reservedCoins,
          };
        });
      } finally {
        await tx.endSession();
      }
    } catch (error) {
      // A concurrent retry may have committed while this transaction was rejected.
      if (isDuplicateKey(error)) {
        const committed = await Bid.findOne({ idempotencyKey }).lean();
        if (committed && committed.bidderId.toString() === user.id && committed.auctionId.toString() === auctionId) {
          return ok({
            bid: { id: committed._id.toString(), amountCoins: committed.amountCoins, acceptedAt: committed.acceptedAt },
            reused: true,
          });
        }
      }
      throw error;
    }

    const response = result.value;
    if (!response) throw new Error("Bid transaction returned no result.");
    return ok(
      {
        bid: { id: response.bidId, amountCoins: response.amountCoins },
        wallet: { availableCoins: response.availableCoins, reservedCoins: response.reservedCoins },
      },
      201,
    );
  },
});
