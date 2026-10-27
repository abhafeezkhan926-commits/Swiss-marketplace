import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export const GET = apiRoute({
  auth: "public",
  handler: async () => {
    try {
      await connectDB();
    } catch {
      throw new ApiError("Database is unavailable or not configured.", 503, "DATABASE_UNAVAILABLE");
    }
    return ok({ service: "markethaus-api", database: "connected", timestamp: new Date().toISOString() });
  },
});
