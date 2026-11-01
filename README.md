# Living Acre

A hectare of Go Dharaa farmland you can walk around, and a studio that turns it
into episodes. Two separate apps in one repository.

| Directory | What it is | Stack |
| --- | --- | --- |
| [`farm/`](farm/) | The farm itself: an isometric/perspective sim of one hectare — crops, orchard layers, cattle, water, signs, a walkable farmer and a recordable tour | Vite + TypeScript + three.js, no server, no runtime network |
| [`living-acre-studio/`](living-acre-studio/) | The studio: series, episodes, asset bible, publishing | Next.js 16 + React 19 + Drizzle/Postgres |

They are independent. You can run either one on its own; nothing in the farm
imports anything from the studio.

---

## Before you start

- **Node.js 22.12 or newer** (24.x is fine too). Check with `node -v`. This floor
  comes from the toolchain, not from preference: Vite 8 wants `^20.19 || >=22.12`
  and Vitest 5 wants `^22.12 || ^24 || >=26`. Verified on v22.22.3.
- **npm 10+** (ships with Node 22).
- No global installs, no CDN, no API keys needed for the farm.

Optional, only for rebuilding or re-verifying the 3D character:

- **Blender 4.2** — either the `blender` binary on `PATH`, or the `bpy` module
  (`pip install bpy==4.2.0`, Python 3.11).
- Chromium + `puppeteer-core` for the in-app screenshot pass. Both are installed
  on demand and are not project dependencies.

---

## The farm — five minutes to running

```sh
cd farm
npm install
npm run dev
```

Open **http://localhost:5173/** for the hectare, or **/acre.html** for the older
acre view. That is the whole setup: no `.env`, no database, no keys.

```sh
npm run dev         # dev server, http://localhost:5173 (add -- --port 5175 to move it)
npm run build       # typecheck + production build into dist/
npm run preview     # serve the built dist/ (http://localhost:4173)
npm run test        # full suite — 229 tests across 17 files
npm run typecheck   # tsc --noEmit
```

### Driving it

Click the ground to walk him there. Then:

| | |
| --- | --- |
| Click / tap | walk to that spot |
| Drag | turn the farm (full-farm view) |
| `←` `→` | turn the camera; in third person, orbit around the farmer |
| `↑` `↓` | zoom |
| `C` or `H` | toggle farmer ⇄ full-farm camera |
| `V` | whole farm ⇄ close |
| `1`–`5` | toggle the orchard layers |
| `T` | play the tour |
| `R` | record the tour |
| `Esc` | leave the tour |
| wheel | zoom |

### URL flags

| URL | What it does |
| --- | --- |
| `?tour=1` | play the 44-second tour on load |
| `?record=1` | record the tour and download it when it ends |
| `?loop=1` | replay the tour forever (kiosk / stream) |
| `?inspect=farmer&orbit=0&distance=7` | character stills rig — see below |

**Where recordings go:** the video is produced in the browser with
`MediaRecorder` and handed straight to your browser as a download, so it lands in
your machine's Downloads folder — nothing is written to the repo or to any
server. The filename is `farm-tour-YYYY-MM-DDTHH-MM-SS.webm` (WebM, VP9 where
supported, 60 fps). The HUD confirms with `Saved farm-tour-….webm · 4.2 MB`. If
you stop with `Esc` instead of **Stop**, the recording is deliberately discarded.

### The farmer

The character is a rigged, animated GLB built in Blender — source, mesh, rig,
clips and the reasoning behind them are documented in
[`farm/scripts/character/README.md`](farm/scripts/character/README.md). To rebuild
him you need Blender:

```sh
cd farm
blender --background --python scripts/character/build_farmer.py -- --out public/models
# or, with the bpy module:
python scripts/character/run_blender.py --out public/models
```

To re-shoot the verification stills **in the running app** (not in a viewport),
with the dev server already running:

```sh
npm install --no-save puppeteer-core @sparticuz/chromium
node scripts/character/verify-farmer.mjs
```

The stills land in `farm/reports/character/`. On a bare Linux box Chromium will
not start without the X11/NSS client libraries; `scripts/character/chromium_shim.py`
builds empty stand-ins for exactly the symbols it asks for:

```sh
python scripts/character/chromium_shim.py /tmp/arena-chromium-libs
LD_LIBRARY_PATH=/tmp/arena-chromium-libs node scripts/character/verify-farmer.mjs
```

---

## The studio

```sh
cd living-acre-studio
npm install
```

It needs a database and a `.env` before it will serve a page. Pick one of the two
routes below.

### 1. Zero-install database (pglite) — easiest

Runs Postgres compiled to WebAssembly, in a local directory. No Postgres, no
Docker, no service to start.

```sh
# the data directory must exist first: pglite will not create it
mkdir -p .data

# the schema lives in drizzle/0000_baseline.sql — apply it once
node -e "
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => {
  const db = new PGlite('.data/db');
  await db.exec(fs.readFileSync('drizzle/0000_baseline.sql', 'utf8'));
  console.log('schema applied');
  await db.close();
})();
"

printf 'DATABASE_URL=pglite://.data/db\n' > .env    # .env is gitignored
npm run db:bootstrap                              # series, assets, config
npm run dev                                       # http://localhost:3000
```

`db:bootstrap` should print `{"series":6,"assets":20,"config":3,"missingPlates":[]}`.
It is idempotent, so running it twice is harmless.

### 2. A real PostgreSQL

`drizzle.config.json` points at `postgresql://postgres:postgres@127.0.0.1:5432/app_db`,
so a stock local Postgres on the default port works:

```sh
createdb -U postgres app_db
psql -U postgres app_db -f drizzle/0000_baseline.sql

printf 'DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db\n' > .env
npm run db:bootstrap
npm run dev
```

### Configuration

Copy the rest of what you need from `.env.example` — it documents every variable
and which ones are optional. The important ones:

- `DATABASE_URL` — required. `pglite://<dir>` for the local database above, or a
  `postgresql://` URL.
- `STUDIO_SECRETS_KEY` — 32 bytes, base64 or hex; encrypts settings saved at
  `/settings`. Generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — for the
  `/settings` key store and auth.
- `GEMINI_API_KEY`, `BUFFER_API_KEY`, `AUTO_PUBLISH` — optional; only needed for
  real narration and publishing.

Nothing here needs a key just to browse the dashboard, episodes and publishing
pages.

### Studio scripts

```sh
npm run dev            # http://localhost:3000
npm run build          # production build
npm start              # serve the production build
npm run test           # 26 tests (no .env needed)
npm run lint
npm run typecheck
npm run db:bootstrap   # seed series / assets / config
npm run db:repair      # repair a partially built episode
npm run episode:audit  # audit one episode
```

---

## Troubleshooting

**`ENOENT: mkdir '…/.data/db'` in the studio.** pglite will not create the parent
directory. `mkdir -p .data` first.

**`DATABASE_URL is required`.** No `.env`, or it is in the wrong folder — it has
to sit beside `living-acre-studio/package.json`, not at the repo root.

**`relation "studio_series" does not exist`.** `db:bootstrap` ran before the
schema was applied. Apply `drizzle/0000_baseline.sql` (above), then bootstrap again.

**Port already in use.** `npm run dev -- --port 5175` for the farm;
`npx next dev --port 3001` for the studio.

**`npm run typecheck` in the studio reports an error in `tests/settings-auth.test.ts`.**
That file is currently untracked work in progress, not part of the committed tree;
`npm run test` passes regardless. The farm's `npm run typecheck` is clean.

**Chromium will not start while shooting character stills.** Missing X11/NSS
libraries — see `chromium_shim.py` above.

---

## Repository layout

```
farm/
  index.html, acre.html      entry points (hectare, acre)
  src/hectare/               the sim: world, walk, move, gait, tour, render/*
  src/sim/                   pure simulation — no three.js, no DOM (enforced by tests)
  public/models/farmer.glb   the rigged character
  assets/character/          farmer.blend — the Blender source
  scripts/character/         build, shims and the in-app verification script
  reports/character/         reference stills
  tests/                     229 tests
living-acre-studio/
  src/app/                   Next.js routes: dashboard, episodes, publishing, settings
  src/lib/studio/            series, asset bible, bootstrap, publishing
  drizzle/                   schema baseline
  tests/                     26 tests
```
