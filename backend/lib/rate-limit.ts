import { connectDB } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { sha256 } from "@/lib/security";
import { ApiRateLimit } from "@/models";

/** Database-backed fixed-window limiter; works across application instances sharing MongoDB. */
export async function enforceRateLimit(scope: string, identifier: string, limit: number, windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60)) {
  await connectDB();
  const safeWindow = Math.max(10, Math.min(3600, windowSeconds));
  const bucket = Math.floor(Date.now() / (safeWindow * 1000));
  const key = sha256(`${scope}:${identifier}:${bucket}`);
  const expiresAt = new Date((bucket + 2) * safeWindow * 1000);
  let record;
  try {
    record = await ApiRateLimit.findOneAndUpdate({ key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  } catch (error) {
    // A concurrent first request can race on the unique key; re-read/update after the winner inserts it.
    if ((error as { code?: number }).code !== 11000) throw error;
    record = await ApiRateLimit.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { new: true });
  }
  if (record && record.count > limit) throw new ApiError("Too many requests. Try again shortly.", 429, "RATE_LIMITED");
}
