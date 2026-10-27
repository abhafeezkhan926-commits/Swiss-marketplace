import { createHash, randomBytes } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function safeUserAgent(request: Request): string {
  return (request.headers.get("user-agent") || "unknown").slice(0, 300);
}
