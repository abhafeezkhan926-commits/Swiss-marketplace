import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ok } from "@/lib/http";
import { productCreateSchema, productQuerySchema } from "@/lib/validation";
import { Product } from "@/models";

export const GET = apiRoute({
  auth: "public",
  query: productQuerySchema,
  handler: async ({ query }) => {
    await connectDB();
    const q = query.q || "";
    const category = query.category || "";
    const { page, limit } = query;

    const filter: Record<string, unknown> = { status: "published" };
    if (category) filter.category = category;
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
        { category: { $regex: escaped, $options: "i" } },
      ];
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("sellerId", "name")
        .lean(),
      Product.countDocuments(filter),
    ]);

    return ok({
      products: products.map((product) => ({
        id: product._id.toString(),
        title: product.title,
        description: product.description,
        category: product.category,
        images: product.images,
        priceMinor: product.priceMinor,
        currency: product.currency,
        stock: product.stock,
        seller:
          product.sellerId && typeof product.sellerId === "object" && "name" in product.sellerId
            ? { name: product.sellerId.name }
            : null,
        createdAt: product.createdAt,
      })),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  },
});

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "product-create", limit: 20 },
  body: productCreateSchema,
  handler: async ({ user, body }) => {
    await connectDB();
    const product = await Product.create({ ...body, sellerId: user.id });
    return ok({ product: { id: product._id.toString(), title: product.title, status: product.status } }, 201);
  },
});
