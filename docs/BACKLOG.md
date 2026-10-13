# Backlog

Work that's decided but parked. Newest first.

## Sales tax on ducats (Georgia)

- **Status:** waiting on a tax professional (added 2026-10-13, after 1.15.0).
- **Question:** does Georgia's sales tax on digital goods (taxed since January 1, 2024 when bought with a
  "permanent right of use") cover in-game currency like ducats? No source found says either way; a 2021 bill
  excluded prepaid "stored value" codes, but that may not be in the law as passed.
- **Ready to switch on:** the sign-in server adds tax through Stripe Tax when `STRIPE_TAX` is `"on"` (see
  `auth-worker/README.md`, Ducats). Tax is added on top of the pack price where Facada inc is registered.
- **To do if it applies:** register in Georgia, set up Stripe Tax (registration and a default product tax code)
  in the live Stripe account, add `"STRIPE_TAX": "on"` to `vars` in `auth-worker/wrangler.jsonc`, deploy the
  sign-in server from `auth-worker/`.

## Title screen backgrounds

- **Status:** shelved (added 2026-10-13, before 1.15).
- **What it is:** a random full-screen scene behind the title screen, a portrait image for phones and a landscape
  one for wider screens, never the same one twice in a row. The scenes are listed in `public/cover/covers.json`.
- **Where the code is:** the git stash "Title screen random cover backgrounds (shelved)", made on `v1.14`. It holds
  `TitleCoverBackground.tsx`, `utils/titleCovers.ts`, its test, the cover styles in `index.css`, the tagline
  shadow and `public/cover/covers.json`. Bring it back with `git stash list`, then `git stash pop stash@{N}`; expect
  small conflicts in `SplashScreen.tsx` and `index.css`.
- **Needs first:** the scene images (no text or logos; about 1080 x 1920 and 1920 x 1080, under 400 KB each, rights
  to publish).
