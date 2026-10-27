import { Readable } from "node:stream";
import { apiRoute } from "@/lib/api";
import { cloudinaryClient } from "@/lib/cloudinary";
import { ApiError, ok } from "@/lib/http";

export const runtime = "nodejs";

const ALLOWED_TYPES: Record<string, { resourceType: "image" | "video" }> = {
  "image/jpeg": { resourceType: "image" },
  "image/png": { resourceType: "image" },
  "image/webp": { resourceType: "image" },
  "video/mp4": { resourceType: "video" },
  "video/quicktime": { resourceType: "video" },
};

function matchesFileSignature(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
  }
  return false;
}

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "media-upload", limit: 12 },
  handler: async ({ request, user }) => {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("multipart/form-data")) {
      throw new ApiError("Upload files as multipart/form-data.", 415, "UNSUPPORTED_MEDIA_TYPE");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError("The multipart upload could not be read.", 400, "INVALID_MULTIPART");
    }

    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("Attach a file using the file field.", 400, "FILE_REQUIRED");

    const supported = ALLOWED_TYPES[file.type];
    if (!supported) throw new ApiError("Supported formats: JPEG, PNG, WebP, MP4, and MOV.", 415, "UNSUPPORTED_FILE_TYPE");

    const configuredMax = Number(process.env.MAX_UPLOAD_MB || 12);
    const maxMb = Number.isFinite(configuredMax) ? Math.min(50, Math.max(1, configuredMax)) : 12;
    if (file.size < 1 || file.size > maxMb * 1024 * 1024) {
      throw new ApiError(`File size must be between 1 byte and ${maxMb} MB.`, 413, "FILE_TOO_LARGE");
    }

    let cloudinary;
    try {
      cloudinary = cloudinaryClient();
    } catch {
      throw new ApiError("Media uploads are not configured on the server.", 503, "UPLOADS_NOT_CONFIGURED");
    }

    const folder = `swiss-marketplace/users/${user.id}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!matchesFileSignature(bytes, file.type)) {
      throw new ApiError("The uploaded file content does not match its declared type.", 415, "FILE_SIGNATURE_MISMATCH");
    }

    let uploaded: {
      secure_url: string;
      public_id: string;
      resource_type: string;
      format: string;
      bytes: number;
    };
    try {
      uploaded = await new Promise<{
        secure_url: string;
        public_id: string;
        resource_type: string;
        format: string;
        bytes: number;
      }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: supported.resourceType,
            allowed_formats: ["jpg", "jpeg", "png", "webp", "mp4", "mov"],
            context: { owner_id: user.id },
          },
          (error, result) => {
            if (error || !result) reject(error || new Error("Cloudinary returned no upload result."));
            else {
              resolve({
                secure_url: result.secure_url,
                public_id: result.public_id,
                resource_type: result.resource_type,
                format: result.format,
                bytes: result.bytes,
              });
            }
          },
        );
        Readable.from([bytes]).pipe(stream);
      });
    } catch (error) {
      console.error("Cloudinary upload failed:", error instanceof Error ? error.message : "Unknown error");
      throw new ApiError("Could not upload the image. Please try again.", 502, "UPLOAD_FAILED");
    }

    return ok(
      {
        secureUrl: uploaded.secure_url,
        publicId: uploaded.public_id,
        resourceType: uploaded.resource_type,
        format: uploaded.format,
        bytes: uploaded.bytes,
        folder,
      },
      201,
    );
  },
});
