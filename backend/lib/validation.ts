import { z } from "zod";

/**
 * All request payloads, query strings, and route parameters are described here.
 * Keeping schemas in one module means every API route validates the same way.
 */

const NULL_BYTE = /\u0000/;

function text(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`)
    .refine((value) => !NULL_BYTE.test(value), `${label} contains invalid characters.`);
}

/** Mongo ObjectIds are 24 hex characters; validating them prevents Mongoose CastError 500s. */
export const objectIdSchema = z.string().trim().regex(/^[0-9a-f]{24}$/i, "Invalid identifier.");
export const idParamsSchema = z.object({ id: objectIdSchema });

export function isCloudinaryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "res.cloudinary.com" || url.hostname.endsWith(".cloudinary.com"))
    );
  } catch {
    return false;
  }
}

export const cloudinaryUrlSchema = z
  .string()
  .trim()
  .max(1000, "Media URLs must be at most 1000 characters.")
  .refine(isCloudinaryUrl, "Media must use an HTTPS Cloudinary URL.");

export const optionalCloudinaryUrlSchema = z.union([cloudinaryUrlSchema, z.literal("")]);

export const currencySchema = z
  .string()
  .trim()
  .length(3, "Use a 3-letter currency code.")
  .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code.")
  .transform((value) => value.toLowerCase());

const registrationPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Use a password of at most 72 bytes.");

export const registerSchema = z
  .object({
    name: text(2, 80, "Name"),
    email: z.string().trim().email("Enter a valid email address.").max(254).transform((value) => value.toLowerCase()),
    password: registrationPasswordSchema,
    adultConfirmed: z.literal(true, { error: "Age confirmation is required." }),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address.").max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(1, "Password is required.").max(128),
  })
  .strict();

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(254)
  .transform((value) => value.toLowerCase());

const resetCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your email.");

export const passwordResetRequestSchema = z.object({ email: emailSchema }).strict();

export const passwordResetConfirmSchema = z
  .object({
    email: emailSchema,
    code: resetCodeSchema,
    password: registrationPasswordSchema,
  })
  .strict();

export const productCreateSchema = z
  .object({
    title: text(3, 120, "Title"),
    description: text(10, 5000, "Description"),
    category: text(2, 60, "Category"),
    priceMinor: z.number().int().positive().max(100000000),
    currency: currencySchema,
    stock: z.number().int().min(0).max(100000).default(1),
    images: z.array(cloudinaryUrlSchema).max(8).default([]),
    status: z.enum(["draft", "published"]).default("published"),
  })
  .strict();

/**
 * Deliberately not `productCreateSchema.partial()`: partial keeps Zod defaults,
 * which would silently reset stock/images/status on every PATCH.
 */
export const productUpdateSchema = z
  .object({
    title: text(3, 120, "Title").optional(),
    description: text(10, 5000, "Description").optional(),
    category: text(2, 60, "Category").optional(),
    priceMinor: z.number().int().positive().max(100000000).optional(),
    currency: currencySchema.optional(),
    stock: z.number().int().min(0).max(100000).optional(),
    images: z.array(cloudinaryUrlSchema).max(8).optional(),
    status: z.enum(["draft", "published"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field to update is required." });

const queryInteger = (min: number, max: number, fallback: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(min).max(max).default(fallback),
  );

export const productQuerySchema = z.object({
  q: text(0, 80, "Search").optional(),
  category: text(0, 60, "Category").optional(),
  page: queryInteger(1, 10000, 1),
  limit: queryInteger(1, 40, 12),
});

export const auctionRequestSchema = z
  .object({
    title: text(3, 120, "Title"),
    description: text(10, 5000, "Description"),
    category: text(2, 60, "Category"),
    images: z.array(cloudinaryUrlSchema).max(8).default([]),
    startingPriceCoins: z.number().int().positive().max(10000000),
    startsAt: z.string().datetime({ offset: true, message: "Use an ISO 8601 start date and time." }),
    durationHours: z.number().int().min(1).max(168),
    shippingInfo: text(0, 1000, "Shipping information").default(""),
  })
  .strict();

export const bidSchema = z
  .object({ amountCoins: z.number().int().positive().max(10000000) })
  .strict();

export const reportSchema = z
  .object({
    targetType: z.enum(["product", "video", "user", "livestream", "auction"]),
    targetId: objectIdSchema,
    reason: z.enum(["scam_fraud", "abusive_or_sexual_content", "other"]),
    explanation: text(0, 2000, "Explanation").optional().default(""),
  })
  .strict()
  .refine((value) => value.reason !== "other" || value.explanation.trim().length >= 5, {
    path: ["explanation"],
    message: "Please explain reports marked Other.",
  });

export const checkoutSchema = z.object({ packageId: objectIdSchema }).strict();

export const cartAddSchema = z
  .object({
    productId: objectIdSchema,
    quantity: z.number().int().min(1).max(99).default(1),
  })
  .strict();

export const cartUpdateSchema = z
  .object({
    productId: objectIdSchema,
    quantity: z.number().int().min(0).max(99),
  })
  .strict();

export const productBuySchema = z
  .object({
    quantity: z.number().int().min(1).max(99).default(1),
  })
  .strict();

export const adminAuctionReviewSchema = z
  .object({
    status: z.enum(["approved", "rejected", "changes_requested"]),
    adminNote: text(0, 2000, "Admin note").default(""),
  })
  .strict();

export const coinPackageCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
    coins: z.number().int().min(5).max(10000000),
    amountMinor: z.number().int().positive().max(1000000000),
    currency: currencySchema,
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10000).default(100),
    description: text(0, 500, "Description").default(""),
  })
  .strict();

export const coinPackageUpdateSchema = z
  .object({
    coins: z.number().int().min(5).max(10000000).optional(),
    amountMinor: z.number().int().positive().max(1000000000).optional(),
    currency: currencySchema.optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    description: text(0, 500, "Description").optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field to update is required." });

export const liveCreateSchema = z
  .object({
    title: text(3, 120, "Title"),
    thumbnailUrl: cloudinaryUrlSchema,
    productIds: z.array(objectIdSchema).max(20).default([]),
  })
  .strict();

export const liveKitTokenSchema = z
  .object({
    roomName: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Invalid room name."),
    publish: z.boolean().default(false),
  })
  .strict();

export const notificationMarkSchema = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ id: objectIdSchema }).strict(),
]);

export const profileUpdateSchema = z
  .object({
    name: text(2, 80, "Name").optional(),
    avatarUrl: optionalCloudinaryUrlSchema.optional(),
    theme: z.enum(["light", "dark"]).optional(),
    accent: z.enum(["indigo", "violet", "teal", "coral"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one permitted profile field is required.",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
export type AuctionRequestInput = z.infer<typeof auctionRequestSchema>;
export type BidInput = z.infer<typeof bidSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type AdminAuctionReviewInput = z.infer<typeof adminAuctionReviewSchema>;
export type CoinPackageCreateInput = z.infer<typeof coinPackageCreateSchema>;
export type CoinPackageUpdateInput = z.infer<typeof coinPackageUpdateSchema>;
export type LiveCreateInput = z.infer<typeof liveCreateSchema>;
export type LiveKitTokenInput = z.infer<typeof liveKitTokenSchema>;
export type NotificationMarkInput = z.infer<typeof notificationMarkSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
