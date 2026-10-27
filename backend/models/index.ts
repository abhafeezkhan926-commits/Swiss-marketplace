import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";

const options = { timestamps: true, minimize: false } as const;
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["user", "admin"], default: "user", required: true },
  status: { type: String, enum: ["active", "suspended"], default: "active", required: true },
  isTestAccount: { type: Boolean, default: false },
  googleId: { type: String, trim: true, maxlength: 255, unique: true, sparse: true },
  avatarUrl: { type: String, default: "" },
  theme: { type: String, enum: ["light", "dark"], default: "light" },
  accent: { type: String, enum: ["indigo", "violet", "teal", "coral"], default: "indigo" },
  emailVerifiedAt: { type: Date, default: null },
  sellerProfile: { storeName: { type: String, trim: true, maxlength: 100 }, bio: { type: String, maxlength: 2000 }, stripeAccountId: { type: String, select: false } },
}, options);
export type UserShape = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserShape>;
export const User = (models.User as Model<UserShape>) || model<UserShape>("User", userSchema);

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  userAgent: { type: String, default: "" },
  ipHash: { type: String, default: "" },
}, options);
export const Session = (models.Session as Model<InferSchemaType<typeof sessionSchema>>) || model("Session", sessionSchema);

const authTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  purpose: { type: String, enum: ["email_verify", "password_reset"], required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: { type: Date, default: null },
  // Bounded guessing for short numeric codes; the route invalidates after 5 misses.
  attempts: { type: Number, default: 0, min: 0, max: 100 },
}, options);
authTokenSchema.index({ userId: 1, purpose: 1, createdAt: -1 });
export const AuthToken = (models.AuthToken as Model<InferSchemaType<typeof authTokenSchema>>) || model("AuthToken", authTokenSchema);

const walletSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  availableCoins: { type: Number, required: true, default: 0, min: 0 },
  reservedCoins: { type: Number, required: true, default: 0, min: 0 },
  purchasedCoinsTotal: { type: Number, required: true, default: 0, min: 0 },
  testCoinsTotal: { type: Number, required: true, default: 0, min: 0 },
  spentCoinsTotal: { type: Number, required: true, default: 0, min: 0 },
}, options);
export const Wallet = (models.Wallet as Model<InferSchemaType<typeof walletSchema>>) || model("Wallet", walletSchema);

const walletTransactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["topup", "test_credit", "bid_reserve", "bid_release", "auction_debit", "product_debit", "refund_credit", "admin_adjustment"], required: true },
  amountCoins: { type: Number, required: true },
  reservedDelta: { type: Number, required: true, default: 0 },
  availableBefore: { type: Number, required: true },
  availableAfter: { type: Number, required: true },
  reservedBefore: { type: Number, required: true },
  reservedAfter: { type: Number, required: true },
  status: { type: String, enum: ["completed", "pending", "reversed"], default: "completed", required: true },
  idempotencyKey: { type: String, required: true, unique: true },
  relatedEntityType: { type: String, default: "" },
  relatedEntityId: { type: String, default: "" },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, options);
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
export const WalletTransaction = (models.WalletTransaction as Model<InferSchemaType<typeof walletTransactionSchema>>) || model("WalletTransaction", walletTransactionSchema);

const coinPackageSchema = new Schema({
  code: { type: String, required: true, unique: true },
  coins: { type: Number, required: true, min: 5, validate: Number.isSafeInteger },
  amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  currency: { type: String, required: true, lowercase: true, minlength: 3, maxlength: 3 },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  description: { type: String, default: "" },
}, options);
export const CoinPackage = (models.CoinPackage as Model<InferSchemaType<typeof coinPackageSchema>>) || model("CoinPackage", coinPackageSchema);

const paymentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  packageId: { type: Schema.Types.ObjectId, ref: "CoinPackage", default: null },
  paymentType: { type: String, enum: ["coin_topup", "auction_fee", "product_order", "platform_fee"], default: "coin_topup", required: true },
  relatedEntityId: { type: String, default: "" },
  provider: { type: String, enum: ["stripe"], default: "stripe" },
  providerSessionId: { type: String, unique: true, sparse: true, index: true },
  checkoutRequestKey: { type: String, unique: true, sparse: true, index: true },
  checkoutUrl: { type: String, default: "" },
  providerPaymentIntentId: { type: String, default: "" },
  amountMinor: { type: Number, required: true },
  currency: { type: String, required: true, lowercase: true },
  coins: { type: Number, required: true, default: 0 },
  status: { type: String, enum: ["pending", "succeeded", "failed", "cancelled", "refunded"], default: "pending", index: true },
  paidAt: { type: Date, default: null },
  failureReason: { type: String, default: "" },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, options);
paymentSchema.index({ userId: 1, createdAt: -1 });
// Prevent two concurrent pending fee checkouts for the same auction request (double-charge risk).
paymentSchema.index(
  { relatedEntityId: 1 },
  { unique: true, partialFilterExpression: { paymentType: "auction_fee", status: "pending" } },
);
export const Payment = (models.Payment as Model<InferSchemaType<typeof paymentSchema>>) || model("Payment", paymentSchema);

const productSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 5000 },
  category: { type: String, required: true, trim: true, maxlength: 60, index: true },
  images: { type: [String], default: [] },
  priceMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, lowercase: true, minlength: 3, maxlength: 3 },
  stock: { type: Number, required: true, default: 1, min: 0 },
  status: { type: String, enum: ["draft", "published", "removed"], default: "published", index: true },
}, options);
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ title: "text", description: "text", category: "text" });
export const Product = (models.Product as Model<InferSchemaType<typeof productSchema>>) || model("Product", productSchema);

const storeSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, default: "", maxlength: 3000 },
  logoUrl: { type: String, default: "" },
  shippingInfo: { type: String, default: "", maxlength: 2000 },
  published: { type: Boolean, default: false },
}, options);
export const Store = (models.Store as Model<InferSchemaType<typeof storeSchema>>) || model("Store", storeSchema);

const auctionRequestSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, maxlength: 120 }, description: { type: String, required: true, maxlength: 5000 },
  category: { type: String, required: true, maxlength: 60 }, images: { type: [String], default: [] },
  startingPriceCoins: { type: Number, required: true, min: 1 }, startsAt: { type: Date, required: true },
  durationHours: { type: Number, required: true, min: 1, max: 168 }, shippingInfo: { type: String, default: "" },
  status: { type: String, enum: ["pending_review", "approved", "rejected", "changes_requested", "published"], default: "pending_review", index: true },
  adminNote: { type: String, default: "" },
  feeAmountMinor: { type: Number, default: 500, min: 0, validate: Number.isSafeInteger },
  feeCurrency: { type: String, default: "chf", lowercase: true, minlength: 3, maxlength: 3 },
  feePaymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, reviewedAt: { type: Date, default: null },
}, options);
export const AuctionRequest = (models.AuctionRequest as Model<InferSchemaType<typeof auctionRequestSchema>>) || model("AuctionRequest", auctionRequestSchema);

const auctionSchema = new Schema({
  requestId: { type: Schema.Types.ObjectId, ref: "AuctionRequest", required: true, unique: true },
  sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, maxlength: 120 }, description: { type: String, required: true, maxlength: 5000 },
  category: { type: String, required: true }, images: { type: [String], default: [] },
  startingPriceCoins: { type: Number, required: true, min: 1 }, currentHighestBidCoins: { type: Number, required: true, default: 0, min: 0 },
  currentHighestBidder: { type: Schema.Types.ObjectId, ref: "User", default: null },
  startsAt: { type: Date, required: true, index: true }, endsAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["scheduled", "active", "completed", "cancelled"], default: "scheduled", index: true },
  winnerId: { type: Schema.Types.ObjectId, ref: "User", default: null }, shippingInfo: { type: String, default: "" },
}, options);
auctionSchema.index({ status: 1, startsAt: 1, endsAt: 1 });
export const Auction = (models.Auction as Model<InferSchemaType<typeof auctionSchema>>) || model("Auction", auctionSchema);

const bidSchema = new Schema({
  auctionId: { type: Schema.Types.ObjectId, ref: "Auction", required: true, index: true },
  bidderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  amountCoins: { type: Number, required: true, min: 1 },
  idempotencyKey: { type: String, required: true, unique: true },
  acceptedAt: { type: Date, required: true, default: Date.now },
}, options);
bidSchema.index({ auctionId: 1, createdAt: -1 });
export const Bid = (models.Bid as Model<InferSchemaType<typeof bidSchema>>) || model("Bid", bidSchema);

const orderSchema = new Schema({
  buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true }, quantity: { type: Number, required: true, min: 1 },
  amountMinor: { type: Number, required: true }, currency: { type: String, required: true }, status: { type: String, enum: ["pending_payment", "paid", "shipped", "completed", "cancelled", "disputed", "refunded"], default: "pending_payment", index: true },
  paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null }, idempotencyKey: { type: String, required: true, unique: true }, shippingAddress: { type: String, default: "" },
}, options);
export const Order = (models.Order as Model<InferSchemaType<typeof orderSchema>>) || model("Order", orderSchema);

const cartItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1, max: 99 },
  },
  { _id: false, minimize: false },
);
const cartSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  items: { type: [cartItemSchema], default: [] },
}, options);
export const Cart = (models.Cart as Model<InferSchemaType<typeof cartSchema>>) || model("Cart", cartSchema);

const refundSchema = new Schema({ paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true }, orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null }, amountMinor: { type: Number, required: true }, currency: { type: String, required: true }, providerRefundId: { type: String, default: "" }, status: { type: String, enum: ["pending", "succeeded", "failed"], default: "pending" }, reason: { type: String, required: true, maxlength: 1000 }, initiatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true } }, options);
export const Refund = (models.Refund as Model<InferSchemaType<typeof refundSchema>>) || model("Refund", refundSchema);

const liveStreamSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, roomName: { type: String, required: true, unique: true },
  title: { type: String, required: true, maxlength: 120 }, thumbnailUrl: { type: String, default: "", maxlength: 1000 }, productIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
  status: { type: String, enum: ["scheduled", "live", "ended"], default: "scheduled", index: true }, startedAt: { type: Date, default: null }, endedAt: { type: Date, default: null },
}, options);
export const LiveStream = (models.LiveStream as Model<InferSchemaType<typeof liveStreamSchema>>) || model("LiveStream", liveStreamSchema);

const notificationSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, type: { type: String, required: true }, title: { type: String, required: true, maxlength: 160 }, body: { type: String, required: true, maxlength: 1000 }, href: { type: String, default: "" }, readAt: { type: Date, default: null }, dedupeKey: { type: String, default: "" } }, options);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $gt: "" } } });
export const Notification = (models.Notification as Model<InferSchemaType<typeof notificationSchema>>) || model("Notification", notificationSchema);

const contentReportSchema = new Schema({
  reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, targetType: { type: String, enum: ["product", "video", "user", "livestream", "auction"], required: true }, targetId: { type: String, required: true },
  reason: { type: String, enum: ["scam_fraud", "abusive_or_sexual_content", "other"], required: true }, explanation: { type: String, default: "", maxlength: 2000 },
  status: { type: String, enum: ["open", "resolved", "rejected", "escalated"], default: "open", index: true }, adminNote: { type: String, default: "" }, reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, reviewedAt: { type: Date, default: null },
}, options);
contentReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1, status: 1 });
export const ContentReport = (models.ContentReport as Model<InferSchemaType<typeof contentReportSchema>>) || model("ContentReport", contentReportSchema);

const auditLogSchema = new Schema({ actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, action: { type: String, required: true }, entityType: { type: String, required: true }, entityId: { type: String, required: true }, reason: { type: String, default: "" }, metadata: { type: Schema.Types.Mixed, default: {} }, ipHash: { type: String, default: "" } }, options);
auditLogSchema.index({ createdAt: -1 });
export const AuditLog = (models.AuditLog as Model<InferSchemaType<typeof auditLogSchema>>) || model("AuditLog", auditLogSchema);

const webhookEventSchema = new Schema({ provider: { type: String, required: true }, eventId: { type: String, required: true, unique: true }, eventType: { type: String, required: true }, processedAt: { type: Date, required: true, default: Date.now } }, options);
export const WebhookEvent = (models.WebhookEvent as Model<InferSchemaType<typeof webhookEventSchema>>) || model("WebhookEvent", webhookEventSchema);

const apiRateLimitSchema = new Schema({ key: { type: String, required: true, unique: true }, count: { type: Number, required: true, default: 0 }, expiresAt: { type: Date, required: true, index: { expires: 0 } } }, { timestamps: true });
export const ApiRateLimit = (models.ApiRateLimit as Model<InferSchemaType<typeof apiRateLimitSchema>>) || model("ApiRateLimit", apiRateLimitSchema);

const platformSettingsSchema = new Schema({ key: { type: String, required: true, unique: true }, value: { type: Schema.Types.Mixed, required: true }, updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null } }, options);
export const PlatformSettings = (models.PlatformSettings as Model<InferSchemaType<typeof platformSettingsSchema>>) || model("PlatformSettings", platformSettingsSchema);

// Defined now so the model catalogue matches the planned module boundaries; feature routes can be added incrementally.
const interactionSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, targetId: { type: Schema.Types.ObjectId, required: true }, targetType: { type: String, required: true }, body: { type: String, default: "" } }, options);
interactionSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });
export const SavedVideo = (models.SavedVideo as Model<InferSchemaType<typeof interactionSchema>>) || model("SavedVideo", interactionSchema);
export const Like = (models.Like as Model<InferSchemaType<typeof interactionSchema>>) || model("Like", interactionSchema);
const commentSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, targetId: { type: Schema.Types.ObjectId, required: true }, body: { type: String, required: true, maxlength: 2000 }, parentId: { type: Schema.Types.ObjectId, default: null } }, options);
export const Comment = (models.Comment as Model<InferSchemaType<typeof commentSchema>>) || model("Comment", commentSchema);
const productVideoSchema = new Schema({ sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true }, productId: { type: Schema.Types.ObjectId, ref: "Product", default: null }, videoUrl: { type: String, required: true }, thumbnailUrl: { type: String, default: "" }, caption: { type: String, default: "", maxlength: 1500 }, status: { type: String, enum: ["published", "removed"], default: "published" } }, options);
export const ProductVideo = (models.ProductVideo as Model<InferSchemaType<typeof productVideoSchema>>) || model("ProductVideo", productVideoSchema);
const participationSchema = new Schema({ auctionId: { type: Schema.Types.ObjectId, ref: "Auction", required: true }, userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" }, reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null } }, options);
participationSchema.index({ auctionId: 1, userId: 1 }, { unique: true });
export const AuctionParticipation = (models.AuctionParticipation as Model<InferSchemaType<typeof participationSchema>>) || model("AuctionParticipation", participationSchema);
