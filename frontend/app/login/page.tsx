import AuthForm from "@/components/AuthForm";
type PageProps = { searchParams: Promise<{ mode?: string; error?: string }> };
export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <AuthForm mode={params.mode === "register" ? "register" : "login"} errorCode={params.error || ""} />;
}
