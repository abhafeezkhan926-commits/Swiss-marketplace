import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { reportSchema } from "@/lib/validation";
import { Auction, ContentReport, LiveStream, Product, ProductVideo, User } from "@/models";

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "content-report", limit: 10 },
  body: reportSchema,
  handler: async ({ user, body }) => {
    if (body.targetType === "user" && body.targetId === user.id) {
      throw new ApiError("You cannot report your own account.", 422, "SELF_REPORT_FORBIDDEN");
    }

    await connectDB();

    let exists: unknown = null;
    switch (body.targetType) {
      case "product":
        exists = await Product.exists({ _id: body.targetId });
        break;
      case "auction":
        exists = await Auction.exists({ _id: body.targetId });
        break;
      case "livestream":
        exists = await LiveStream.exists({ _id: body.targetId });
        break;
      case "user":
        exists = await User.exists({ _id: body.targetId });
        break;
      case "video":
        exists = await ProductVideo.exists({ _id: body.targetId });
        break;
    }
    if (!exists) throw new ApiError("The reported item was not found.", 404, "TARGET_NOT_FOUND");

    const duplicate = await ContentReport.findOne({
      reporterId: user.id,
      targetType: body.targetType,
      targetId: body.targetId,
      status: "open",
    }).lean();
    if (duplicate) throw new ApiError("You already have an open report for this item.", 409, "DUPLICATE_REPORT");

    const report = await ContentReport.create({ ...body, reporterId: user.id, status: "open" });
    return ok({ report: { id: report._id.toString(), status: report.status } }, 201);
  },
});
