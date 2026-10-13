# Hall of Fame server (Cloudflare Worker + D1)

The game keeps every career on the player's device. When the game is built with `VITE_LEADERBOARD_URL`
pointing at this Worker, each finished season is also sent here, and the Hall of Fame shows the careers of
every player.

- `POST /api/hof/careers` (on footballcoachgame.com, where the sign-in cookie is sent) stores a career's totals.
  The player must be signed in (the sign-in server's session, read from its database `hsfhc-auth`). Only the
  device that started a career can update it (its secret token is checked against a stored hash), and only for
  the same player.
- `GET /leaderboard?length=` returns a Hall of Fame board: the top 50 careers of one length (3, 5 or 10 years)
  across every program. It works on this Worker's own address and under `/api/hof/`.
- `GET /leaderboard?state=&school=&length=` returns the top 50 for one starting program (used by games before 1.8).

Each submission is checked before it's stored:

- The school must be in the state's data (a scenario program, a "Your Pick" school or a new job).
- The record must be possible for the number of seasons played (at most 25 college signees a season).
- The points must match the formula: the seasons' points times the starting-prestige bonus,
  1 + (99 - starting prestige) / 100.
- A first contract starts at its program's prestige (Reclaim at most 72, Powerhouse at least 96, Your Pick its
  own). Any other starting prestige (an extension or a new job) needs a finished career by the same player.
- A new career arrives at its first season (or two), each later season at least a minute after the last, and a
  player starts at most 10 careers a day.

Scores are still computed on the player's device, so a patient cheater with an account can still post a believable
career; sign-in makes such entries removable and their players bannable.

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
- 1.14 adds `migrations/0003_owner.sql` (each career's player): run step 2 again, then deploy.
- To change the schema, add a new numbered file in `migrations/` and run step 2 again.
- To look at the data:

  ```bash
  npx wrangler d1 execute hsfhc-leaderboard --remote --command "SELECT coach_name, starting_program, length, points FROM careers ORDER BY points DESC LIMIT 20"
  ```

- To remove a career:

  ```bash
  npx wrangler d1 execute hsfhc-leaderboard --remote --command "DELETE FROM careers WHERE career_id = '...'"
  ```
