"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, RefreshCw, ShieldCheck, TimerReset } from "lucide-react";
import PasswordField from "@/components/PasswordField";

type Envelope<T> = { ok: boolean; data?: T; error?: { message: string; code?: string } };
type RequestData = { accepted: boolean; expiresInSeconds: number; delivery?: "email" | "development"; devCode?: string };
type ConfirmData = { user: { name: string }; sessionsRevoked: boolean };

export default function PasswordResetForm({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devCode, setDevCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function sendCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as Envelope<RequestData>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error?.message || "Could not send the code.");
      const ttl = Math.max(1, result.data.expiresInSeconds || 60);
      setStep("confirm");
      setCode(result.data.devCode || "");
      setDevCode(result.data.devCode || "");
      setExpiresAt(Date.now() + ttl * 1000);
      setSecondsLeft(ttl);
      setNotice(`If an account uses ${email}, a 6-digit code is on its way. It expires in ${ttl} seconds and works once.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendCode();
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    if (secondsLeft <= 0) { setError("This code has expired. Request a new one."); return; }
    if (password !== confirmPassword) { setError("The new passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const result = (await response.json()) as Envelope<ConfirmData>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error?.message || "Could not update your password.");
      setNotice(`Password updated. Every other session has been signed out, and you are now signed in as ${result.data.user.name}.`);
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  function changeEmail() {
    setStep("request");
    setCode(""); setPassword(""); setConfirmPassword("");
    setDevCode(""); setExpiresAt(0); setSecondsLeft(0);
    setNotice(""); setError("");
  }

  return <div className="auth-wrap"><div className="auth-card">
    <span className="eyebrow"><KeyRound size={14} /> Account recovery</span>
    <h1>{step === "request" ? "Reset your password" : "Enter your code"}</h1>
    <p>{step === "request"
      ? "Enter your account email. We will send a one-time 6-digit code that expires after one minute."
      : "Enter the code from the email, then choose a new password. Codes are valid for 60 seconds and can be used only once."}</p>

    {error && <div className="notice error" role="alert" style={{ marginBottom: 17 }}>{error}</div>}
    {notice && <div className="notice success" role="status" style={{ marginBottom: 17 }}>{notice}</div>}

    {step === "request" ? <form onSubmit={submitEmail}>
      <div className="field"><label htmlFor="reset-email">Email address</label><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Mail size={18} color="#8a93a5" /><input id="reset-email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></div></div>
      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Sending…" : "Send reset code"}<Mail size={17} /></button>
    </form> : <form onSubmit={submitCode}>
      {devCode && <div className="notice warning" style={{ marginBottom: 17 }}>
        <strong>Local test code: <span style={{ letterSpacing: ".22em", fontSize: "1.05rem" }}>{devCode}</span></strong>
        <div className="helper" style={{ marginTop: 5, color: "inherit" }}>Email delivery is not configured in this environment. Set RESEND_API_KEY and EMAIL_FROM in the backend to send real email.</div>
      </div>}
      <div className="field"><label htmlFor="reset-code">6-digit code</label><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><ShieldCheck size={18} color="#8a93a5" /><input id="reset-code" className="input" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} /></div>
        <div className="spread"><span className="helper">Sent to {email}</span><span className="helper" style={{ color: secondsLeft > 0 ? "#4f46e5" : "#a42b3a", fontWeight: 700 }}><TimerReset size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />{secondsLeft > 0 ? `Expires in ${secondsLeft}s` : "Code expired"}</span></div>
      </div>
      <div className="field"><label htmlFor="reset-password">New password</label><PasswordField id="reset-password" autoComplete="new-password" placeholder="At least 10 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} maxLength={128} /></div>
      <div className="field"><label htmlFor="reset-confirm">Confirm new password</label><PasswordField id="reset-confirm" autoComplete="new-password" placeholder="Repeat the new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={10} maxLength={128} /></div>
      <button className="btn btn-primary" type="submit" disabled={busy || secondsLeft <= 0 || code.length !== 6} style={{ width: "100%" }}>{busy ? "Updating…" : "Update password"}<CheckCircle2 size={17} /></button>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void sendCode()} disabled={busy || secondsLeft > 0}><RefreshCw size={14} />{secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Send a new code"}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={changeEmail}><ArrowLeft size={14} />Change email</button>
      </div>
    </form>}

    <div className="divider" />
    <p className="small" style={{ margin: 0, textAlign: "center" }}>Remembered your password? <Link href="/login" style={{ color: "#4f46e5", fontWeight: 800 }}>Back to sign in</Link></p>
  </div></div>;
}
