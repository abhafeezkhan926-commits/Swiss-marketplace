# MarketHaus — Swiss Live Shopping Marketplace

This repository is arranged as requested: a parent folder contains the project folder, and the project folder contains **separate `frontend/` and `backend/` applications**.

```text
Swiss-Live-Shopping-Workspace/
└── MarketHaus-Swiss-Live-Shopping-Marketplace/
    ├── frontend/   # Next.js UI, React components, styling, client-side pages
    └── backend/    # Next.js API, MongoDB models/services, auth, provider integrations, seed scripts
```

## Run locally

Requirements: Node.js 20.19+ and a MongoDB Atlas URI (transactions require a replica-set database). Open two terminals in the project folder.

### 1. Configure and start the backend

```powershell
cd backend
npm install
Copy-Item .env.example .env.local
# Edit .env.local and set MONGODB_URI, APP_SECRET, admin/test credentials, and optional provider keys.
npm run seed:packages
npm run seed:test-user
npm run seed:admin
npm run dev
```

The API runs on `http://localhost:3001`; the service health check is `http://localhost:3001/api/health`. Leave the backend terminal running.

### 2. Configure and start the frontend

In the second terminal, from the project folder:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
# BACKEND_URL defaults to http://localhost:3001; adjust only if your API runs elsewhere.
npm run dev
```

Open `http://localhost:3000`. The frontend's Next.js rewrite proxies `/api/*` requests to the backend, keeping browser API calls same-origin so HttpOnly session cookies work without exposing database or provider secrets to the browser. For production, deploy `frontend/` and `backend/` as separate Next.js projects and set the frontend's `BACKEND_URL` to the backend's HTTPS origin. On the backend, keep `APP_URL` set to the public frontend URL for payment redirects. Point Stripe webhooks directly to the backend's `/api/webhooks/stripe` endpoint.

## Security & provider configuration

Password hashes use bcrypt; opaque session tokens are stored as SHA-256 hashes and delivered only through HttpOnly cookies. Privileged actions, wallet changes, payment amounts, and bid validation are server-authoritative. A Stripe success redirect does not credit coins; the backend verifies the webhook signature and payment metadata first. Never commit `.env.local` files or use the sample seed credentials in production.

Every API route goes through one shared wrapper (`backend/lib/api.ts`) that applies authentication and role checks, database-backed rate limits, Zod validation for bodies, query strings, and route IDs, consistent error responses, and `no-store` caching. All request schemas live in `backend/lib/validation.ts`. Invalid input returns HTTP 422 with `error.code: "VALIDATION_ERROR"` and a `fields` array; malformed JSON, oversized bodies, wrong content types, bad ObjectIds, and missing idempotency keys return specific 4xx codes instead of 500s. State-changing flows that create payments or bids require an `Idempotency-Key` header (8-200 printable characters).

`backend/proxy.ts` (Next.js 16's middleware convention) runs before every `/api/*` request: it adds request IDs and security headers, enforces a JSON body-size limit (`MAX_JSON_BODY_KB`), rejects TRACE/TRACK/CONNECT, and blocks cross-site state-changing requests through `Origin`/`Sec-Fetch-Site` checks. Same-origin, `APP_URL`, localhost in development, and any comma-separated `ALLOWED_ORIGINS` entries are trusted; add a production frontend origin to `ALLOWED_ORIGINS` if it ever differs from `APP_URL`.

The app's current state is a development starter with a working security/payment/wallet vertical slice and API-backed product, auction-request, LiveKit, notification and admin foundations. It is **not** a claim that every large-marketplace feature is production complete. Review the implementation boundaries and checklist in this README before launch.

## Google sign-in

Google sign-in is optional and disabled until credentials are configured. In Google Cloud Console, create an OAuth 2.0 Client ID of type **Web application**, then add this exact authorized redirect URI:

```text
${APP_URL}/api/auth/google/callback
```

For local development that is `http://localhost:3000/api/auth/google/callback` (the frontend origin, not the backend port; the frontend proxies `/api/*` to the backend). Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env.local`. Override `GOOGLE_REDIRECT_URI` only if the callback intentionally uses a different public origin, and register that exact value in Google Cloud Console.

The backend uses the OAuth 2.0 authorization-code flow with PKCE, a short-lived HttpOnly state cookie, and `openid email profile` scope. It verifies the Google ID token, requires a verified email, links the Google account to an existing user with the same verified email, creates a wallet when missing, and issues the same opaque session cookie used by password login. Suspended accounts and email/Google-account conflicts are rejected. Secrets never reach the browser. Without valid credentials, the login page shows a friendly "Google sign-in is not configured" message instead of failing silently.

## Password reset

Both members and administrators can reset a password from `/forgot-password` (linked from the login form and Settings). The backend emails a six-digit code that expires after 60 seconds, can be used once, and allows at most five wrong guesses. A successful reset revokes every existing session and signs the account in with a new session.

Configure email delivery with `RESEND_API_KEY` and a verified `EMAIL_FROM` in `backend/.env.local`. Without them, local development logs the code in the backend terminal and displays a clearly labelled test code on the reset page; `ALLOW_DEV_EMAIL_CODES=true` additionally permits this fallback under `next start` when `APP_URL` is localhost. A deployed environment with a public `APP_URL` refuses to issue codes until a provider is configured.

## Admin access

`/admin` and every `/api/admin/*` route are admin-only. Signed-out visitors, ordinary members, and invalid sessions receive the normal 404 page or a 404 API response, so privileged endpoints are not advertised. The admin navigation link appears only for an `admin` role. Seed an administrator once with a unique password of at least 14 characters:

```powershell
cd backend
npm run seed:admin
```

The seed script never changes the role of an existing normal account and never resets an existing administrator password.

## Run checks

```powershell
cd frontend; npm run typecheck; npm run lint; npm run build
cd ..\backend; npm run typecheck; npm run lint; npm run build
```

## 5. Coin wallet rules

Default packages are 5, 100, 200, 300, and 400 coins. By default, top-up prices follow the brief's USD reference values: 5 coins = USD 5; 100 = USD 100; 200 = USD 200; 300 = USD 300; 400 = USD 400. The default checkout currency is USD (`COIN_TOPUP_CURRENCY=usd`).

Do not switch the checkout currency to CHF and assume it has the same value. For a non-USD currency, set `COIN_PACKAGE_PRICES_JSON` with explicit prices in that currency's smallest units and set `MIN_TOPUP_AMOUNT_MINOR` appropriately. For example, `{"5":550,"100":9900,"200":19500,"300":29000,"400":38000}` is a sample configuration only (CHF 5.50, CHF 99, CHF 195, CHF 290, and CHF 380), not an exchange-rate quote or business recommendation. Ensure the minimum package satisfies `MIN_TOPUP_AMOUNT_MINOR`. Provider account, currency, TWINT, and Swiss marketplace compliance eligibility must be checked independently before public use.

Top-ups are credited only by `POST /api/webhooks/stripe` after Stripe signature verification and matching checkout session, user ID, expected amount, currency, payment type, and metadata. Visiting `/checkout/success` never credits coins. The wallet ledger has unique idempotency keys and is written in the same database transaction as the balance update. No cash withdrawal or peer-to-peer coin transfer is implemented.

### Configure Stripe test webhooks

1. Use Stripe test credentials first; put `STRIPE_SECRET_KEY` in `.env.local`.
2. Start the app.
3. Use the Stripe CLI or the Stripe Dashboard test endpoint to forward events to `http://localhost:3001/api/webhooks/stripe`.
4. Put the matching webhook signing secret in `STRIPE_WEBHOOK_SECRET` and restart the app.
5. Test successful, cancelled, expired, duplicate, and mismatched events. Confirm that only the verified successful event credits the ledger.

The Checkout endpoint currently accepts card payments explicitly. TWINT and other payment methods are not enabled by default because availability depends on the actual Stripe account, currency, and current configuration.

## 6. API quick reference

Import `backend/postman/MarketHaus.postman_collection.json` into Postman to exercise the health, authentication, product, wallet, auction, notification, and admin APIs. Leave `baseUrl` at `http://localhost:3000` to use the frontend proxy, then log in in the collection before running protected requests; use test accounts and Stripe test mode only. `backend/tests/manual-smoke-checks.md` contains the security and payment regression checklist.

All JSON endpoints use a consistent response shape, typically `{ "ok": true, "data": ... }` or `{ "ok": false, "error": ... }`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register; bcrypt password hash; create wallet and server-side session |
| POST | `/api/auth/login` | Verify password and issue an opaque HttpOnly session token |
| POST | `/api/auth/logout` | Revoke the hashed session and clear cookie |
| GET | `/api/auth/me` | Current user and wallet summary |
| POST | `/api/auth/password-reset/request` | Email a 60-second, single-use reset code (generic response) |
| POST | `/api/auth/password-reset/confirm` | Consume the code, replace the password, revoke sessions, sign in |
| GET | `/api/auth/google/start` | Redirect to Google consent with PKCE and a signed state cookie |
| GET | `/api/auth/google/callback` | Verify Google state and ID token, link/create the account, issue a session |
| GET | `/api/wallet` | Wallet balance, transaction ledger, and recent payment records |
| GET | `/api/wallet/packages` | Active top-up packages |
| POST | `/api/wallet/checkout` | Create Stripe Checkout session from a server-priced package ID |
| POST | `/api/webhooks/stripe` | Verify payment, apply idempotent top-up/auction fee status updates |
| GET/POST | `/api/products` | Browse/search published listings; create product record |
| GET/PATCH/DELETE | `/api/products/:id` | View/edit/remove an owned listing (delete is a soft removal) |
| GET/POST | `/api/auctions` | Browse scheduled/active listings; submit auction request |
| POST | `/api/auctions/:id/participation` | Request or receive participation approval according to platform setting |
| POST | `/api/auctions/:id/bids` | Place a server-validated, idempotent coin bid |
| GET | `/api/auctions/requests` | View the signed-in seller's requests and review/fee status |
| POST | `/api/auctions/requests/:id/fee-checkout` | Create approved auction publishing-fee checkout |
| GET | `/api/live` | Discover streams that are marked live |
| POST | `/api/live` | Start a stream after checking LiveKit configuration |
| PATCH | `/api/live/:id` | End an owned stream |
| POST | `/api/livekit/token` | Issue a short-lived room token after permission checks |
| POST | `/api/uploads` | Authenticated, type/size-limited media upload proxy to Cloudinary |
| POST | `/api/uploads/signature` | Return signed Cloudinary upload parameters to authenticated users
| GET/PATCH | `/api/notifications` | List notifications, mark one/all read |
| POST | `/api/reports` | Submit a report with duplicate-open-report protection |
| GET | `/api/profile`; PATCH `/api/profile` | Read and update permitted profile/theme fields only |
| GET | `/api/admin/dashboard` | Admin-only summary statistics |
| GET/POST | `/api/admin/coin-packages` | Admin-only package list/create |
| PATCH | `/api/admin/coin-packages/:id` | Admin-only package configuration update |
| GET | `/api/admin/auction-requests` | Admin-only queue of seller requests |
| PATCH | `/api/admin/auction-requests/:id` | Approve/reject/request changes with audit log |

## 7. Auction wallet handling

A bid cannot be accepted solely from a browser-provided balance. The server checks participation, auction timing, the seller/bidder relationship, and the amount. A leading bid is reserved in the wallet; when outbid, the old leader's reservation is released. A leading bidder who raises their own bid releases their previous reservation before reserving the new amount, so the same coins are not locked twice. The MongoDB transaction creates the accepted bid, wallet transaction record, and auction update together.

The seller's auction request remains unpublished until admin approval and (when configured) a fee payment verified by Stripe's webhook. `AUCTION_FEE_AMOUNT_MINOR` is the configured fee in minor units, with `AUCTION_FEE_CURRENCY` identifying the currency; the example is CHF 5.00. For local UI testing only, setting the fee to zero disables the fee. Do not leave a zero fee in production if the approved business flow requires a fee.

This code is intended for bona fide sales of actual products. Do not add chance-based prize games, wagering, or cash conversion of marketplace credits.

## 8. Cloudinary uploads

The authenticated `POST /api/uploads` endpoint accepts a `multipart/form-data` field called `file`, enforces a configurable size limit and JPEG/PNG/WebP/MP4/MOV MIME allowlist, and uploads through the server to Cloudinary. `POST /api/uploads/signature` is also available for an advanced direct-upload UI; never expose `CLOUDINARY_API_SECRET` to client code. Product/profile APIs accept HTTPS Cloudinary URLs and reject arbitrary external media URLs. Configure Cloudinary account-level restrictions and inspect uploaded content before public launch.

## 9. LiveKit

Configure `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`. Stream records are stored in MongoDB. Viewer and publisher tokens are generated only by the server, with publishing granted only when the current user owns the stream. Tokens are short-lived. Ensure room cleanup, moderation, chat rules, connection failure handling, and actual service/account settings are reviewed before launch.

## 10. Current implementation boundaries

Implemented core flows: account registration/login/logout, bcrypt password hashing, hash-only session-token storage, database-backed auth throttling, account roles, 60-second single-use email-code password reset with session revocation, MongoDB wallet & ledger, package configuration, Stripe checkout creation, signature-verified idempotent top-up processing, demo-only credits, product create/browse/edit/soft-remove APIs, auction request review, optional auction fee Checkout, published auction persistence after fee webhook, participation and server-side bid/reservation logic, notifications, reports, settings, admin stats/package controls, Cloudinary signatures, and LiveKit room token/UI scaffolding.

Still requires more work before production: an email provider account and verified sender for production reset delivery, plus email verification delivery; complete Stripe Connect seller onboarding/charges/commissions/payout reconciliation; fixed-price order checkout and shipping status flows; refunds and the complete three-/five-business-day dispute workflow; complete user/video/likes/comments/save moderation screens; comprehensive admin report/dispute tooling; real-time bidding/notification fanout via a separately hosted real-time service or a managed alternative; business-day calendar rules; full accessibility/security penetration testing; audit/report exports; and automated end-to-end tests. Mongoose models for several of these areas are included to support incremental implementation, but model definitions alone do not make those workflows complete.

## 11. Deployment checklist

- Use a production MongoDB Atlas URI and confirm replica-set transactions work.
- Use unique secrets; do not deploy the sample admin/test passwords.
- Set `APP_URL` to the exact HTTPS production origin; add any additional browser origins to `ALLOWED_ORIGINS`.
- Review `MAX_JSON_BODY_KB`, `MAX_UPLOAD_MB`, and rate-limit window settings for expected traffic.
- Configure Stripe live mode only after business/legal review and use the correct webhook secret.
- Verify coin package prices and supported checkout currencies explicitly.
- Configure Cloudinary upload limits/preset policy and LiveKit permissions.
- Disable test account seeding and demo credits in production.
- Review cookie/domain configuration, rate-limit capacity, logging, access controls, indexes, backups, retention, privacy and data-protection requirements.
- Test duplicate webhook delivery, insufficient balances, concurrent bids, authorization failures, cancelled payments, and failed third-party services.

Do not describe this starter as fully compliant or production-ready until the missing workflows are implemented and tested against the actual provider accounts and the final Swiss business/legal requirements.
