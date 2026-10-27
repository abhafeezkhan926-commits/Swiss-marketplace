import { ApiError } from "@/lib/http";

/**
 * Minimal transactional email adapter. Resend is used when a key and sender are
 * configured; otherwise development falls back to a server console message so
 * the reset flow stays testable without a paid email account. Production never
 * prints codes and fails closed when delivery is not configured.
 */

export type EmailDelivery = { delivered: boolean; provider: "resend" | "console" };

export const RESET_CODE_TTL_SECONDS = 60;

function resendKey(): string {
  return (process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY || "").trim();
}

function sender(): string {
  return (process.env.EMAIL_FROM || "").trim();
}

export function emailDeliveryConfigured(): boolean {
  return Boolean(resendKey() && sender());
}

/**
 * `next start` reports NODE_ENV=production even on a developer's laptop, so the
 * console fallback also accepts an explicit opt-in that only works when
 * APP_URL is local. This keeps codes out of a real deployment by accident.
 */
function devEmailFallbackAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.ALLOW_DEV_EMAIL_CODES !== "true") return false;
  try {
    const host = new URL(process.env.APP_URL || "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function resetEmail(code: string): { subject: string; text: string; html: string } {
  const subject = "Your MarketHaus password reset code";
  const text = [
    `Your MarketHaus password reset code is ${code}.`,
    "",
    `It expires in ${RESET_CODE_TTL_SECONDS} seconds and can be used once.`,
    "If you did not request this, you can ignore this email — your password has not changed.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1c2433">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e2e6ef;border-radius:18px;padding:32px">
    <p style="margin:0 0 18px;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#5b55d6">MarketHaus</p>
    <h1 style="margin:0 0 10px;font-size:24px;letter-spacing:-.02em">Reset your password</h1>
    <p style="margin:0 0 22px;line-height:1.6;color:#526078">Enter this one-time code on the password reset page. It expires in ${RESET_CODE_TTL_SECONDS} seconds and works only once.</p>
    <div style="font-size:34px;letter-spacing:.28em;font-weight:800;background:#f2f1ff;border:1px solid #dcd8ff;border-radius:14px;padding:18px 20px;text-align:center;color:#3730a3">${code}</div>
    <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#77839a">If you did not request a password change, you can ignore this email. Your password has not changed.</p>
  </div>
</body></html>`;
  return { subject, text, html };
}

export async function sendPasswordResetCode(email: string, code: string): Promise<EmailDelivery> {
  if (!emailDeliveryConfigured()) {
    if (!devEmailFallbackAllowed()) {
      throw new ApiError("Email delivery is not configured. Contact the marketplace administrator.", 503, "EMAIL_NOT_CONFIGURED");
    }
    console.info(`[dev-email] Password reset code for ${email}: ${code} (valid ${RESET_CODE_TTL_SECONDS}s, single use)`);
    return { delivered: false, provider: "console" };
  }

  const message = resetEmail(code);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: sender(),
        to: [email],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError("The email service could not be reached. Try again shortly.", 503, "EMAIL_DELIVERY_FAILED");
  }

  if (!response.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[email] Resend rejected a password reset email with status ${response.status}.`);
    }
    throw new ApiError("The email could not be sent. Try again shortly.", 503, "EMAIL_DELIVERY_FAILED");
  }
  return { delivered: true, provider: "resend" };
}
