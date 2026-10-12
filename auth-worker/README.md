# Sign-in server (Cloudflare Worker + D1)

Optional player accounts for Football Coach High School Edition: Google, Facebook and an emailed sign-in link
(no passwords). It runs on the game's own domain at `https://footballcoachgame.com/api/auth/*`; a Worker route
there takes priority over the game's static site, so the sign-in cookie is first-party.

- Sessions are an HttpOnly cookie (30 days). Tokens and email links are stored only as SHA-256 hashes.
- The same verified email is one player, whichever way they sign in.
- "Send me game news" is off unless the player ticks it; the time they opted in is stored as proof of consent.
- Players can turn news off, sign out and delete their account (everything stored with it) from the game.
- Facebook's data deletion callback is built in (`/api/auth/facebook/delete`).
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
