import { connectDB } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { CoinPackage } from "@/models";

const DEFAULT_COINS = [5, 100, 200, 300, 400];

function configuredPrices(): Record<string, number> | null {
  const raw = process.env.COIN_PACKAGE_PRICES_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^\d+$/.test(key) || typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return null;
      result[key] = value;
    }
    return result;
  } catch { return null; }
}

export async function ensureDefaultPackages() {
  await connectDB();
  const existingCount = await CoinPackage.countDocuments();
  if (existingCount > 0) return;
  const currency = (process.env.COIN_TOPUP_CURRENCY || "usd").toLowerCase();
  let prices: Record<string, number>;
  if (currency === "usd") {
    prices = { "5": 500, "100": 10000, "200": 20000, "300": 30000, "400": 40000 };
  } else {
    const explicit = configuredPrices();
    if (!explicit) throw new ApiError("Coin packages are not configured for this currency. Set COIN_PACKAGE_PRICES_JSON with explicit smallest-unit prices before enabling top-ups.", 503, "PACKAGE_PRICING_NOT_CONFIGURED");
    const requiredPackages = [5, 100, 200, 300, 400];
    if (requiredPackages.some((coins) => !explicit[String(coins)])) throw new ApiError("COIN_PACKAGE_PRICES_JSON must define explicit prices for packages 5, 100, 200, 300, and 400.", 503, "INCOMPLETE_PACKAGE_PRICING");
    prices = explicit;
  }
  const minimum = Number(process.env.MIN_TOPUP_AMOUNT_MINOR || 500);
  if (!Number.isSafeInteger(minimum) || minimum < 1) throw new ApiError("MIN_TOPUP_AMOUNT_MINOR configuration is invalid.", 500, "INVALID_SERVER_CONFIG");
  for (const coins of DEFAULT_COINS) {
    const amountMinor = prices[String(coins)];
    if (!amountMinor) continue;
    if (coins === 5 && amountMinor < minimum) throw new ApiError("The minimum package is below MIN_TOPUP_AMOUNT_MINOR.", 500, "INVALID_PACKAGE_CONFIG");
    await CoinPackage.updateOne({ code: `coins-${coins}` }, { $setOnInsert: { code: `coins-${coins}`, coins, amountMinor, currency, active: true, sortOrder: coins } }, { upsert: true });
  }
}

export function formatPrice(amountMinor: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(amountMinor / 100); }
  catch { return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`; }
}

// Product prices are stored in minor CHF; one coin buys one whole CHF.
export function coinsForMinor(amountMinor: number) {
  return Math.max(1, Math.round(amountMinor / 100));
}
