import { apiRouteWithParams } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { coinPackageUpdateSchema, idParamsSchema } from "@/lib/validation";
import { AuditLog, CoinPackage } from "@/models";

export const PATCH = apiRouteWithParams({
  auth: "admin",
  rateLimit: { scope: "admin-coin-package-update", limit: 60 },
  params: idParamsSchema,
  body: coinPackageUpdateSchema,
  handler: async ({ user: admin, params, body }) => {
    if (body.currency !== undefined && body.currency !== (process.env.COIN_TOPUP_CURRENCY || "usd").toLowerCase()) {
      throw new ApiError(
        "Package currency must match COIN_TOPUP_CURRENCY. Do not assume USD and CHF are equal.",
        422,
        "CURRENCY_CONFIGURATION_MISMATCH",
      );
    }
    if (body.coins !== undefined && body.coins < 5) {
      throw new ApiError("Packages must contain at least 5 coins.", 422, "INVALID_PACKAGE");
    }
    const minAmount = Number(process.env.MIN_TOPUP_AMOUNT_MINOR || 500);
    if (!Number.isSafeInteger(minAmount) || minAmount < 1) {
      throw new ApiError("MIN_TOPUP_AMOUNT_MINOR configuration is invalid.", 500, "INVALID_SERVER_CONFIG");
    }
    if (body.amountMinor !== undefined && body.amountMinor < minAmount) {
      throw new ApiError("Package amount is below the minimum top-up value.", 422, "INVALID_PACKAGE");
    }

    await connectDB();
    const pkg = await CoinPackage.findById(params.id);
    if (!pkg) throw new ApiError("Package not found.", 404, "NOT_FOUND");

    Object.assign(pkg, body);
    await pkg.save();

    await AuditLog.create({
      actorId: admin.id,
      action: "coin_package_updated",
      entityType: "CoinPackage",
      entityId: pkg._id.toString(),
      reason: "Admin changed coin package configuration",
      metadata: body,
    });

    return ok({
      package: {
        id: pkg._id.toString(),
        code: pkg.code,
        coins: pkg.coins,
        amountMinor: pkg.amountMinor,
        currency: pkg.currency,
        active: pkg.active,
      },
    });
  },
});
