# Global leaderboard (Cloudflare Worker + D1)

The game keeps every career on the player's device. When the game is built with `VITE_LEADERBOARD_URL`
pointing at this Worker, each finished season is also sent here, and the Leaderboard tab shows the careers of
every player.

- `POST /careers` stores a career's totals. Only the device that started a career can update it (its secret
  token is checked against a stored hash).
- `GET /leaderboard?state=&school=&length=` returns the top 50 for one starting program and career length.
- `GET /leaderboard` returns the top 50 across every program. Add `?length=` to filter by career length.

Each submission is checked before it's stored:

- The program must be one of the scenario programs.
- The record must be possible for the number of seasons played.
- The points must match the formula.

Scores are still computed on the player's device. Someone who sends a believable fake career can't be caught
without simulating the games on the server.

## One-time setup

Run these from this folder (`leaderboard-worker/`). Wrangler opens a browser to sign in to your Cloudflare
account the first time.

1. Create the database:

   ```bash
   npx wrangler d1 create hsfhc-leaderboard
   ```

   Copy the `database_id` it prints into `wrangler.jsonc`, in place of `REPLACE_WITH_DATABASE_ID`.

2. Create the table:

   ```bash
   npx wrangler d1 migrations apply hsfhc-leaderboard --remote
   ```

3. Set `ALLOWED_ORIGINS` in `wrangler.jsonc` to the game's address, for example
   `https://high-school-football-coach.<your-subdomain>.workers.dev`. Use a comma-separated list to allow more
   than one origin. Add `http://localhost:3000` to test from the dev server.

4. Deploy:

   ```bash
   npx wrangler deploy
   ```

   It prints the Worker's address, for example `https://hsfhc-leaderboard.<your-subdomain>.workers.dev`.

5. Point the game at it. In the Cloudflare dashboard, open the game's Worker (`high-school-football-coach`), go
   to **Settings → Build → Variables and secrets**, and add a **build** variable:
   `VITE_LEADERBOARD_URL = https://hsfhc-leaderboard.<your-subdomain>.workers.dev`. Then redeploy the game,
   for example by pushing a commit. For local testing, put the same line in a `.env.local` file next to the
   game's `package.json`.

## Updating

- To change the Worker, run `npx wrangler deploy` again from this folder.
- To change the schema, add a new numbered file in `migrations/` and run step 2 again.
- To look at the data:

  ```bash
  npx wrangler d1 execute hsfhc-leaderboard --remote --command "SELECT coach_name, starting_program, length, points FROM careers ORDER BY points DESC LIMIT 20"
  ```

- To remove a career:

  ```bash
  npx wrangler d1 execute hsfhc-leaderboard --remote --command "DELETE FROM careers WHERE career_id = '...'"
  ```
