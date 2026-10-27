import { apiRoute } from "@/lib/api";
import { cloudinaryClient } from "@/lib/cloudinary";
import { ApiError, ok } from "@/lib/http";

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "cloudinary-signature", limit: 20 },
  handler: async ({ user }) => {
    let cloudinary;
    try {
      cloudinary = cloudinaryClient();
    } catch {
      throw new ApiError("Media uploads are not configured on the server.", 503, "UPLOADS_NOT_CONFIGURED");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `swiss-marketplace/users/${user.id}`;
    const params = { timestamp, folder };
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET!);

    return ok({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      timestamp,
      folder,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    });
  },
});
