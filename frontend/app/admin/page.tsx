import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import AdminClient from "@/components/AdminClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin dashboard · MarketHaus" };

const backendUrl = (process.env.BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");

type MeResponse = { ok?: boolean; data?: { user?: { role?: string } | null } };

async function hasAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  if (!cookie) return false;
  try {
    const response = await fetch(`${backendUrl}/api/auth/me`, {
      headers: { cookie, accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as MeResponse;
    return Boolean(payload.ok && payload.data?.user?.role === "admin");
  } catch {
    return false;
  }
}

export default async function AdminPage() {
  // The admin UI must never render for guests or ordinary members. Returning
  // the regular 404 page keeps the route indistinguishable from a missing URL.
  if (!(await hasAdminSession())) notFound();
  return <AdminClient />;
}
