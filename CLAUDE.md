# High School Football Head Coach: working rules

A React + TypeScript + Vite + Zustand PWA. Production deploys from `main` on Cloudflare
(https://high-school-football-coach.protheus99.workers.dev).

## Mockup first (standard step)

Before building any visible change (a new screen, a redesign, a new pop-up, new buttons, a layout change), make a
visual mockup and get it approved. Don't move forward or commit until it's approved.

1. Read the code the change touches, so the mockup uses the game's real data, names and styles.
2. Show an interactive preview at phone width (375px), with the states that matter (empty, selected, error, done).
3. List the decisions still open next to it.
4. Revise until it's approved, then build, then verify in the browser at phone size.

Bug fixes, wording changes and behind-the-scenes work don't need a mockup, but say what will change.

## Design

- Mobile first: design for a 375px phone, then let it grow.
- Colorful cards with depth (soft shadows, colored edges, icons) and real buttons. Not minimalist.
- Keep summaries roomy: one idea per line rather than cramming.

## Branches and releases

- Each version gets its own branch (`v1.8`); tags are `v1.8.0`. Merge to `main` only when asked.
- Release: bump the version in `package.json` and the two lines in `package-lock.json`, commit
  "Version X.Y.Z: ...", merge with `--ff-only` into `main`, push, add an annotated tag, push it, then confirm the
  live site serves the new build (compare its `assets/index-*.js` with the local `dist`).

## Commits

- Commit only after the full test suite (`npx vitest run`) passes twice and `npm run build` succeeds.
- Statistical tests can fail by chance near their thresholds (turnovers, sim calibration); rerun before
  treating that as a regression.
- End every commit message with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Game balance

- Don't lock in powerhouses: high school programs rise and fall. Measure title turnover in multi-season runs before
  changing growth, recruiting or training.

## Music

- Songs go in `public/music`, covers in `public/music/covers`; `public/music/soundtrack.json` explains the format.
- Only music the owner has the right to share: everything there is published.
