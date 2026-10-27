# Backend API

This folder owns Next.js Route Handlers under `app/api`, Mongoose models, database/security services, Stripe, Cloudinary and LiveKit server integrations, seed scripts, the Postman collection and smoke-test checklist. The API listens on port 3001.

1. Copy `.env.example` to `.env.local` and fill required values.
2. Run `npm install`.
3. Run `npm run seed:packages`, `npm run seed:test-user`, and `npm run seed:admin` in development only.
4. Run `npm run dev`; check `/api/health`.

Configure `APP_URL` as the frontend's public origin so Stripe and Google OAuth redirects land on the UI. Add any other browser origins that call the API directly to `ALLOWED_ORIGINS` (comma-separated). Configure Stripe webhook to point directly at `/api/webhooks/stripe` on this backend origin. For Google sign-in, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and register `${APP_URL}/api/auth/google/callback` in Google Cloud Console (or set `GOOGLE_REDIRECT_URI` to the exact registered value). Never expose backend secrets to the frontend. Read the project-root README for API details and known implementation boundaries.

Password reset codes are delivered through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set. `EMAIL_PROVIDER_API_KEY` is accepted as a legacy alias. Local development without a provider prints the code in the backend terminal and shows a labelled test code on `/forgot-password`; set `ALLOW_DEV_EMAIL_CODES=true` to allow that fallback under `next start` with a localhost `APP_URL`. Never enable the fallback on a deployed origin. Admin routes intentionally return 404 to non-admin sessions.

All routes are composed with `lib/api.ts` (`apiRoute` / `apiRouteWithParams`), which enforces auth, rate limits, Zod body/query/param validation, and consistent errors. Request schemas are centralized in `lib/validation.ts`. `proxy.ts` applies security headers, CSRF origin checks, and request-body size limits before routes run. Payment and bid creation endpoints require an `Idempotency-Key` header. Run `npm run typecheck`, `npm run lint`, and `npm run build` after changes.
