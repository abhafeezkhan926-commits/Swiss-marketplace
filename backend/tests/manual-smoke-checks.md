# Manual API smoke checks

Use a local development database with MongoDB transaction support. Import `postman/MarketHaus.postman_collection.json` and set its variables.

## Authentication and session security

- Register with a unique email and `adultConfirmed: true` only for an actually adult-eligible account.
- Confirm the response sets an HttpOnly session cookie and never returns the raw session token in JSON.
- Inspect the `sessions` collection and verify only `tokenHash` is stored, not the raw cookie value.
- Login using the correct password, then try an incorrect password. Check rate limits and consistent error responses.
- Call `/api/auth/me`, then `/api/auth/logout`, then call `/api/auth/me` again; the revoked session must fail.
- Confirm a normal user receives HTTP 403 from admin routes.

## Database-backed marketplace data

- Create a product while signed in; confirm the record exists in MongoDB and is returned through `/api/products`.
- Update and soft-delete only a product you own; verify another user's session cannot change it.
- Submit an auction request with a start time at least ten minutes in the future; verify it is pending review and not publicly listed before admin approval.
- Test report submission and duplicate open report protection.
- Verify notifications are returned from the backend and unread actions persist.

## Wallet and Stripe test mode

- Run the package seed script twice and confirm it does not reset admin-edited package prices.
- Confirm a normal test buyer starts with zero purchased coins; the separate development demo account is initialized exactly once at the configured test balance.
- Create Stripe test Checkout with a fresh `Idempotency-Key`.
- Use the Stripe CLI test webhook forwarding setup documented in `README.md`.
- Confirm successful signed webhook events update the wallet and ledger once; replay the same event and confirm no duplicate credit.
- Confirm cancelled, expired, unpaid, invalidly signed, wrong-currency, wrong-amount, and mismatched-metadata events do not credit the wallet.
- Confirm a client cannot change `availableCoins` by sending a profile or wallet request.

## Auctions and media

- A bid must fail if the auction isn't active, the bidder is the seller, participation isn't approved, the bid is below the minimum, or available coins are insufficient.
- When a valid leader is outbid, verify the previous leader's reservation is released and all wallet changes have ledger entries.
- Verify every bid carries a unique `Idempotency-Key`; reusing the same key for another user or auction must fail.
- Test image/video MIME allowlist, size limits, file signatures, and missing Cloudinary configuration.
- Verify a user can get a LiveKit publish token only for their own stream; a viewer token must not grant publishing.

## Pre-production checks

- Run `npm run typecheck`, `npm run lint`, `npm run build`, and a full end-to-end suite in an environment with dependencies installed.
- Keep `NODE_ENV=production` seeding disabled; replace every sample password and use secret manager/environment variables.
- Complete the payment, settlement, dispute, email, realtime fanout and accessibility/security work listed in the README before enabling public transactions.
