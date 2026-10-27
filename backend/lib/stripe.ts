import Stripe from "stripe";

let instance: Stripe | null = null;
export function stripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!instance) instance = new Stripe(process.env.STRIPE_SECRET_KEY);
  return instance;
}
