import { apiRouteWithParams } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { idParamsSchema, productUpdateSchema } from "@/lib/validation";
import { Product } from "@/models";

export const GET = apiRouteWithParams({
  auth: "public",
  params: idParamsSchema,
  handler: async ({ params }) => {
    await connectDB();
    const product = await Product.findOne({ _id: params.id, status: "published" }).populate("sellerId", "name").lean();
    if (!product) throw new ApiError("Product not found.", 404, "NOT_FOUND");
    return ok({
      id: product._id.toString(),
      title: product.title,
      description: product.description,
      category: product.category,
      images: product.images,
      priceMinor: product.priceMinor,
      currency: product.currency,
      stock: product.stock,
      sellerId: String(product.sellerId),
      createdAt: product.createdAt,
    });
  },
});

export const PATCH = apiRouteWithParams({
  auth: "user",
  rateLimit: { scope: "product-update", limit: 30 },
  params: idParamsSchema,
  body: productUpdateSchema,
  handler: async ({ user, params, body }) => {
    await connectDB();
    const product = await Product.findById(params.id);
    if (!product) throw new ApiError("Product not found.", 404, "NOT_FOUND");
    if (product.sellerId.toString() !== user.id && user.role !== "admin") {
      throw new ApiError("You cannot edit this product.", 403, "FORBIDDEN");
    }
    Object.assign(product, body);
    await product.save();
    return ok({ product: { id: product._id.toString(), title: product.title, status: product.status } });
  },
});

export const DELETE = apiRouteWithParams({
  auth: "user",
  rateLimit: { scope: "product-delete", limit: 10 },
  params: idParamsSchema,
  handler: async ({ user, params }) => {
    await connectDB();
    const product = await Product.findById(params.id);
    if (!product) throw new ApiError("Product not found.", 404, "NOT_FOUND");
    if (product.sellerId.toString() !== user.id && user.role !== "admin") {
      throw new ApiError("You cannot remove this product.", 403, "FORBIDDEN");
    }
    product.status = "removed";
    await product.save();
    return ok({ removed: true });
  },
});
