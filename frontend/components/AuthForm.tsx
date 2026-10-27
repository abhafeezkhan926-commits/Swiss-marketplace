"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, UserRound, ShieldCheck, Sparkles } from "lucide-react";
import PasswordField from "@/components/PasswordField";

type Props = { mode?: "login" | "register"; errorCode?: string };
type ApiResponse = { ok: boolean; data?: { user?: { name: string } }; error?: { message: string } };
const OAUTH_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured yet. Please use email and password.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state_invalid: "Your Google sign-in session expired. Please try again.",
  google_account_conflict: "This email is already linked to a different Google account.",
  account_suspended: "This account is suspended.",
  google_failed: "Google sign-in could not be completed. Please try again.",
};
export default function AuthForm({ mode = "login", errorCode = "" }: Props) {
  const isRegister = mode === "register";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(OAUTH_ERRORS[errorCode] || "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(isRegister ? { name, email, password, adultConfirmed } : { email, password }) });
      const result = (await response.json()) as ApiResponse;
      if (!response.ok || !result.ok) throw new Error(result.error?.message || "Could not complete your request.");
      router.push("/"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Network error. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="auth-wrap"><div className="auth-card">
    <span className="eyebrow"><Sparkles size={14} /> Secure marketplace</span>
    <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
    <p>{isRegister ? "Join sellers and shoppers discovering products in one place." : "Sign in to manage your account, wallet, listings, and live shopping."}</p>
    {error && <div className="notice error" role="alert" style={{ marginBottom: 17 }}>{error}</div>}
    <a className="btn btn-google" href="/api/auth/google/start" aria-label="Continue with Google">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 39.6 16.1 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.3 5.3C37.3 38.9 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
      Continue with Google
    </a>
    <div className="auth-divider"><span>or use email</span></div>
    <form onSubmit={submit}>
      {isRegister && <div className="field"><label htmlFor="name">Full name</label><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><UserRound size={18} color="#8a93a5" /><input id="name" className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} /></div></div>}
      <div className="field"><label htmlFor="email">Email address</label><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Mail size={18} color="#8a93a5" /><input id="email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></div></div>
      <div className="field"><div className="spread"><label htmlFor="password">Password</label>{!isRegister && <Link href="/forgot-password" className="helper" style={{ color: "#4f46e5", fontWeight: 800 }}>Forgot password?</Link>}</div><PasswordField id="password" autoComplete={isRegister ? "new-password" : "current-password"} placeholder={isRegister ? "At least 10 characters" : "Your password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isRegister ? 10 : 1} maxLength={128} />{isRegister && <div className="helper">Use at least 10 characters and a password you don&apos;t use elsewhere.</div>}</div>
      {isRegister && <label className="row" style={{ alignItems: "flex-start", gap: 10, fontSize: ".83rem", lineHeight: 1.5, color: "#536078", margin: "4px 0 19px" }}><input type="checkbox" checked={adultConfirmed} onChange={(e) => setAdultConfirmed(e.target.checked)} required style={{ marginTop: 4 }} /><span>I confirm that I meet the marketplace&apos;s adult-eligibility requirements and will follow applicable laws.</span></label>}
      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 3 }}>{busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}<ShieldCheck size={17} /></button>
    </form>
    <div className="divider" />
    <p className="small" style={{ margin: 0, textAlign: "center" }}>{isRegister ? "Already have an account? " : "New to MarketHaus? "}<Link href={isRegister ? "/login" : "/login?mode=register"} style={{ color: "#4f46e5", fontWeight: 800 }}>{isRegister ? "Sign in" : "Create account"}</Link></p>
  </div></div>;
}
