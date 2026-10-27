import type { Metadata } from "next";
import PasswordResetForm from "@/components/PasswordResetForm";

export const metadata: Metadata = { title: "Reset password · MarketHaus" };

type PageProps = { searchParams: Promise<{ email?: string }> };

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";
  return <PasswordResetForm initialEmail={email} />;
}
