import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, isDuplicateKey, ok } from "@/lib/http";
import { coinPackageCreateSchema } from "@/lib/validation";
import { AuditLog, CoinPackage } from "@/models";

export const GET = apiRoute({
  auth: "admin",
  handler: async () => {
    await connectDB();
    const list = await CoinPackage.find().sort({ sortOrder: 1 }).lean();
    return ok({
      packages: list.map((pkg) => ({
        id: pkg._id.toString(),
        code: pkg.code,
        coins: pkg.coins,
        amountMinor: pkg.amountMinor,
        currency: pkg.currency,
        active: pkg.active,
        sortOrder: pkg.sortOrder,
        description: pkg.description,
      })),
    });
  },
});

export const POST = apiRoute({
  auth: "admin",
  rateLimit: { scope: "admin-coin-package-create", limit: 60 },
  body: coinPackageCreateSchema,
  handler: async ({ user: admin, body }) => {
    const configuredCurrency = (process.env.COIN_TOPUP_CURRENCY || "usd").toLowerCase();
    if (body.currency !== configuredCurrency) {
      throw new ApiError(
        "Package currency must match COIN_TOPUP_CURRENCY. Configure all package prices explicitly before changing currency.",
        422,
        "CURRENCY_CONFIGURATION_MISMATCH",
      );
    }
    const minAmount = Number(process.env.MIN_TOPUP_AMOUNT_MINOR || 500);
    if (!Number.isSafeInteger(minAmount) || minAmount < 1) {
      throw new ApiError("MIN_TOPUP_AMOUNT_MINOR configuration is invalid.", 500, "INVALID_SERVER_CONFIG");
    }
    if (body.coins < 5 || body.amountMinor < minAmount) {
      throw new ApiError("Package does not meet the configured minimum top-up requirements.", 422, "INVALID_PACKAGE");
    }

    await connectDB();
    let pkg;
    try {
      pkg = await CoinPackage.create(body);
    } catch (error) {
      if (isDuplicateKey(error)) throw new ApiError("A coin package with this code already exists.", 409, "PACKAGE_CODE_EXISTS");
      throw error;
    }

    await AuditLog.create({
      actorId: admin.id,
      action: "coin_package_created",
      entityType: "CoinPackage",
      entityId: pkg._id.toString(),
      reason: "Admin created coin package",
      metadata: { code: pkg.code, coins: pkg.coins, currency: pkg.currency, amountMinor: pkg.amountMinor },
    });

    return ok(
      {
        package: {
          id: pkg._id.toString(),
          code: pkg.code,
          coins: pkg.coins,
          amountMinor: pkg.amountMinor,
          currency: pkg.currency,
          active: pkg.active,
        },
      },
      201,
    );
  },
});
