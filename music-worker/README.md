# Music server (Cloudflare Worker + R2)

The game's songs are licensed, so they are never in the public GitHub repository or in the game's own site files.
They live in a private R2 bucket (`hsfhc-music`), and this Worker streams them to the game:

- `GET /music/<file>` streams one song that is listed in `public/music/soundtrack.json` (with byte ranges, so it
  can start quickly and seek). Nothing can be listed.
- Only the game's pages are answered (`ALLOWED_ORIGINS` in `wrangler.jsonc`). Opening a song's link directly, or
  asking for it from another website or a download tool, gets "403 This music plays in the game only".
- Songs are sent to play, never as downloads.

A browser has to receive a song to play it, so this keeps the files from being offered as downloads; it can't stop
someone recording what they hear.

The live game streams from `https://hsfhc-music.protheus99.workers.dev`. The dev server (`npm run dev`) plays the
local copies in `public/music` instead (they're git-ignored, and every build drops them from `dist`).

## One-time setup

Run these from this folder (`music-worker/`). Wrangler is already signed in on this PC (`npx wrangler whoami`).

1. Create the private bucket:

   ```bash
   npx wrangler r2 bucket create hsfhc-music
   ```

2. Upload the songs (one command uploads all of them; it takes a few minutes):

   ```bash
   for f in ../public/music/*.mp3; do npx wrangler r2 object put "hsfhc-music/$(basename "$f")" --file "$f" --content-type audio/mpeg --remote; done
   ```

3. Deploy the Worker:

   ```bash
   npx wrangler deploy
   ```

4. Check it: this should print `ok`, and opening any song link in a browser should show "This music plays in the
   game only".

   ```bash
   curl https://hsfhc-music.protheus99.workers.dev/health
   ```

## Adding or removing a song

1. Put the MP3 in `public/music` and add it to `soundtrack.json` (the game only plays what's listed there).
2. Upload it: `npx wrangler r2 object put "hsfhc-music/<file name>" --file "../public/music/<file name>" --content-type audio/mpeg --remote`
3. Redeploy this Worker (`npx wrangler deploy`): it only serves songs in the soundtrack it was deployed with.
4. Commit `soundtrack.json` (the MP3 itself stays out of git).

To remove one: take it out of `soundtrack.json`, redeploy, and delete it from the bucket with
`npx wrangler r2 object delete "hsfhc-music/<file name>" --remote`.
