import { apiRoute } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ApiError, ok } from "@/lib/http";
import { coinsForMinor } from "@/lib/wallet";
import { cartAddSchema, cartUpdateSchema } from "@/lib/validation";
import { Cart, Product } from "@/models";

type PopulatedProduct = {
  _id: unknown;
  title: string;
  description: string;
  category: string;
  images: string[];
  priceMinor: number;
  currency: string;
  stock: number;
  status: string;
  sellerId?: { name?: string } | null;
};

function serializeCart(cart: { items: { productId?: PopulatedProduct | unknown; quantity: number }[] } | null) {
  const items = (cart?.items || [])
    .map((item) => {
      const product = item.productId as PopulatedProduct | null;
      if (!product || typeof product !== "object" || !("_id" in product)) return null;
      return {
        productId: String(product._id),
        title: product.title,
        description: product.description,
        category: product.category,
        image: product.images?.[0] || "",
        priceMinor: product.priceMinor,
        currency: product.currency,
        stock: product.stock,
        quantity: item.quantity,
        sellerName: product.sellerId?.name || "Marketplace seller",
        available: product.status === "published" && product.stock >= item.quantity,
      };
    })
    .filter(Boolean) as {
    productId: string;
    title: string;
    description: string;
    category: string;
    image: string;
    priceMinor: number;
    currency: string;
    stock: number;
    quantity: number;
    sellerName: string;
    available: boolean;
  }[];

  const totalMinor = items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  return {
    items,
    totalMinor,
    coins: items.reduce((sum, item) => sum + coinsForMinor(item.priceMinor * item.quantity), 0),
    currency: items[0]?.currency || "chf",
    // The badge counts distinct cards, not units: adding the same card twice shows one card with quantity 2.
    count: items.length,
  };
}

async function findCart(userId: string) {
  return Cart.findOne({ userId }).populate({
    path: "items.productId",
    select: "title description category images priceMinor currency stock status sellerId",
    populate: { path: "sellerId", select: "name" },
  });
}

export const GET = apiRoute({
  auth: "user",
  handler: async ({ user }) => {
    await connectDB();
    const cart = await findCart(user.id);
    return ok(serializeCart(cart));
  },
});

export const POST = apiRoute({
  auth: "user",
  rateLimit: { scope: "cart-update", limit: 60 },
  body: cartAddSchema,
  handler: async ({ user, body }) => {
    await connectDB();
    const product = await Product.findById(body.productId).select("status stock").lean();
    if (!product || product.status !== "published") throw new ApiError("This product is no longer available.", 404, "PRODUCT_NOT_FOUND");
    if (product.stock < 1) throw new ApiError("This product is out of stock.", 409, "OUT_OF_STOCK");

    const cart = (await Cart.findOne({ userId: user.id })) || (await Cart.create({ userId: user.id, items: [] }));
    const existing = cart.items.find((item) => item.productId.toString() === body.productId);
    const nextQuantity = Math.min((existing?.quantity || 0) + body.quantity, Math.min(99, product.stock));
    if (existing) existing.quantity = nextQuantity;
    else cart.items.push({ productId: body.productId, quantity: Math.min(body.quantity, product.stock) });
    await cart.save();

    const populated = await findCart(user.id);
    return ok(serializeCart(populated), 201);
  },
});

export const PATCH = apiRoute({
  auth: "user",
  rateLimit: { scope: "cart-update", limit: 60 },
  body: cartUpdateSchema,
  handler: async ({ user, body }) => {
    await connectDB();
    const cart = await Cart.findOne({ userId: user.id });
    if (!cart) throw new ApiError("Your cart is empty.", 404, "CART_NOT_FOUND");

    const index = cart.items.findIndex((item) => item.productId.toString() === body.productId);
    if (index === -1) throw new ApiError("That item is not in your cart.", 404, "ITEM_NOT_FOUND");

    if (body.quantity === 0) {
      cart.items.splice(index, 1);
    } else {
      const product = await Product.findById(body.productId).select("stock").lean();
      const max = Math.min(99, product?.stock ?? 99);
      cart.items[index].quantity = Math.min(body.quantity, Math.max(1, max));
    }
    await cart.save();

    const populated = await findCart(user.id);
    return ok(serializeCart(populated));
  },
});

export const DELETE = apiRoute({
  auth: "user",
  handler: async ({ user }) => {
    await connectDB();
    await Cart.updateOne({ userId: user.id }, { $set: { items: [] } });
    return ok({ items: [], totalMinor: 0, coins: 0, currency: "chf", count: 0 });
  },
});
