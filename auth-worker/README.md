# Sign-in server (Cloudflare Worker + D1)

Optional player accounts for Football Coach High School Edition: Google, Facebook and an emailed sign-in link
(no passwords). It runs on the game's own domain at `https://footballcoachgame.com/api/auth/*`; a Worker route
there takes priority over the game's static site, so the sign-in cookie is first-party.

- Sessions are an HttpOnly cookie (30 days). Tokens and email links are stored only as SHA-256 hashes.
- The same verified email is one player, whichever way they sign in.
- "Send me game news" is off unless the player ticks it; the time they opted in is stored as proof of consent.
- Players can turn news off, sign out and delete their account (everything stored with it) from the game.
- Facebook's data deletion callback is built in (`/api/auth/facebook/delete`).
- Ducats: the paid currency, bought through Stripe and kept on the player's account (see below).
- Cloud saves: signed-in players' saves (gzip, about 2 MB each, up to 10) live in the R2 bucket `hsfhc-saves`; the
  database lists them. Deleting the account deletes them.

**Run every command below from this folder** (`cd auth-worker`). Running `npx wrangler deploy` in the game's
root folder would deploy the game itself instead.

## One-time setup

1. Create the database, then paste the id it prints into `wrangler.jsonc` (`database_id`):

   ```bash
   npx wrangler d1 create hsfhc-auth
   ```

2. Create the cloud saves bucket:

   ```bash
   npx wrangler r2 bucket create hsfhc-saves
   ```

3. Create the tables (run again after any new file in `migrations/`):

   ```bash
   npx wrangler d1 migrations apply hsfhc-auth --remote
   ```

4. Put the public ids in `wrangler.jsonc` (`vars`): `GOOGLE_CLIENT_ID`, and `FACEBOOK_APP_ID` once the Facebook app
   exists. An empty id turns that sign-in option off.

5. Store the secrets in Cloudflare. Wrangler asks for each value and hides it; never paste them in a file in the
   repository or in a chat:

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put FACEBOOK_APP_SECRET
   ```

6. Deploy:

   ```bash
   npx wrangler deploy
   ```

7. Check it: this should print `{"ok":true}`.

   ```bash
   curl https://footballcoachgame.com/api/auth/health
   ```

## Provider settings

**Google** (Google Cloud, APIs & Services, Credentials, your OAuth client):
- Authorized JavaScript origins: `https://footballcoachgame.com`, `http://localhost:3000`
- Authorized redirect URIs: `https://footballcoachgame.com/api/auth/callback/google`,
  `http://localhost:3000/api/auth/callback/google`
- Consent screen scopes: `openid`, `email`, `profile`; link the privacy policy and terms once they're live.

**Facebook** (Meta for Developers, your app, Facebook Login):
- Valid OAuth redirect URI: `https://footballcoachgame.com/api/auth/callback/facebook`
- Data deletion callback URL: `https://footballcoachgame.com/api/auth/facebook/delete`
- Permissions: `email`, `public_profile`

**Resend**: verify `footballcoachgame.com` and create a sending-only API key. The sender is `EMAIL_FROM` in
`wrangler.jsonc`.

## Ducats (Stripe)

Ducats (₾) are the paid currency. Players buy packs on Stripe's own checkout page; Stripe tells this server (a
signed webhook) and only then are the ducats added to the player's account, in the `ducat_ledger` table. The packs
and coach prices are in `src/data/ducats.ts`, shared by the game and this server. Ducats are off until both
Stripe secrets are set.

1. Create the table: `npx wrangler d1 migrations apply hsfhc-auth --remote` (adds `0003_ducats.sql`).
2. In the Stripe dashboard, **Developers, Webhooks, Add endpoint**:
   - URL: `https://footballcoachgame.com/api/auth/stripe/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`,
     `charge.dispute.created`, `charge.dispute.closed`
3. Store the secret key (Developers, API keys) and the endpoint's signing secret (`whsec_...`):

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

4. Deploy (`npx wrangler deploy`, from this folder).
5. Optional: **Settings, Customer emails**: turn on receipts for successful payments.

Use the test-mode keys (`sk_test_...`) first: Stripe's test card `4242 4242 4242 4242` buys a pack without
real money. Switch both secrets to the live ones when it all works.

- **US cards only:** a payment with a card from anywhere else is refunded automatically and adds nothing.
- **Refunds** (from the Stripe dashboard) and **chargebacks** take the same share of the pack back off the
  player's balance; a chargeback that's won puts it back.
- **Sales tax:** off by default. To collect it, set up Stripe Tax (your registrations, and a default product tax
  code) in the dashboard, then add `"STRIPE_TAX": "on"` to `vars` in `wrangler.jsonc` and deploy. Tax is then
  added on top of the pack price where you're registered.

A player's ledger:

```bash
npx wrangler d1 execute hsfhc-auth --remote --command "SELECT kind, amount, ref, cents, datetime(created_at / 1000, 'unixepoch') FROM ducat_ledger WHERE user_id = (SELECT id FROM users WHERE email = 'player@example.com') ORDER BY id"
```

## Played games

A game counts once it kicks off: the game sends each played game (in progress, then final) to the signed-in
player's account, so loading a save on another device can't replay it. `GET /api/auth/played-games?career=<key>`
lists a career's games; `PUT /api/auth/played-games` records up to 50 at a time (a final is permanent; a game in
progress is replaced only by a newer state or its final). Deleting the account removes them.

1. Create the table: `npx wrangler d1 migrations apply hsfhc-auth --remote` (adds `0004_played_games.sql`).
2. Deploy: `npx wrangler deploy`. Until then the game keeps played games in this browser only.

## Testing on this computer

1. Copy `.dev.vars.example` to `.dev.vars` (git-ignored) and fill in your own secrets. Local runs use a local
   database and bucket, never the live ones.
2. Create the local tables: `npx wrangler d1 migrations apply hsfhc-auth --local`
3. Start the sign-in server (port 8787): `npx wrangler dev`
4. In the game's folder, `npm run dev`: the dev server passes `/api/auth` to it, so sign-in works at
   `http://localhost:3000`.

## The email list

Players who opted in to game news:

```bash
npx wrangler d1 execute hsfhc-auth --remote --command "SELECT email, name, marketing_opt_in_at FROM users WHERE marketing_opt_in = 1 AND email IS NOT NULL"
```

Every marketing email needs an unsubscribe link (and turning news off in the game removes the player from this
list).
