import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { notificationMarkSchema } from "@/lib/validation";
import { Notification } from "@/models";

export const GET = apiRoute({
  auth: "user",
  handler: async ({ user }) => {
    await connectDB();
    const items = await Notification.find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).lean();
    return ok({
      notifications: items.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        title: item.title,
        body: item.body,
        href: item.href,
        readAt: item.readAt,
        createdAt: item.createdAt,
      })),
    });
  },
});

export const PATCH = apiRoute({
  auth: "user",
  rateLimit: { scope: "notification-update", limit: 60 },
  body: notificationMarkSchema,
  handler: async ({ user, body }) => {
    await connectDB();
    if ("all" in body) {
      const result = await Notification.updateMany(
        { userId: user.id, readAt: null },
        { $set: { readAt: new Date() } },
      );
      return ok({ updated: true, matched: result.matchedCount });
    }
    const result = await Notification.updateOne(
      { _id: body.id, userId: user.id },
      { $set: { readAt: new Date() } },
    );
    return ok({ updated: result.matchedCount > 0 });
  },
});
