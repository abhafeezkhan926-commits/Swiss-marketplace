import { cookies } from "next/headers";
import { apiRoute } from "@/lib/api";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { sha256 } from "@/lib/security";
import { Session } from "@/models";

export const POST = apiRoute({
  auth: "public",
  handler: async () => {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;

    try {
      if (token) {
        await connectDB();
        await Session.deleteOne({ tokenHash: sha256(token) });
      }
    } catch (error) {
      // Still clear the browser cookie so the client is not left holding a token
      // after a failed server-side revocation.
      const response = fail(error);
      clearSessionCookie(response);
      return response;
    }

    const response = ok({ loggedOut: true });
    clearSessionCookie(response);
    return response;
  },
});
