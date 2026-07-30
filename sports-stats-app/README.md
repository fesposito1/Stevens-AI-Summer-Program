# Sports Stats Search

Desktop app (Flask + a native window via pywebview) to look up teams and players across sports
(soccer, basketball, football, hockey, baseball, golf, tennis, MMA/boxing, and more) using
TheSportsDB free API, plus your own account for logging sport-specific personal stats, comparing
yourself to pro athletes, a leaderboard against other users, and simple trend projections.

## Just want to run it?

Double-click `dist/SportsStatsApp.exe` — no Python install required. It opens as its own
desktop window (not a browser tab). Create an account on first launch.

## Run from source

```
pip install -r requirements.txt
python app.py
```

This also opens a native window automatically (via pywebview), not a browser tab.

## Build the standalone .exe yourself

```
pip install pyinstaller
pyinstaller --onefile --name SportsStatsApp --add-data "templates;templates" --add-data "static;static" app.py
```

The exe is written to `dist/SportsStatsApp.exe`.

## Deploy to the cloud (free, so a shared leaderboard works across multiple people)

The desktop exe is single-machine only (SQLite file, one person's Windows install). To let
several people log stats and see each other on the same leaderboard, deploy the same app to
Render's free tier instead — no laptop needs to stay on.

`db.py` auto-detects which backend to use: if a `DATABASE_URL` environment variable is present
it uses Postgres (cloud), otherwise it uses the local SQLite file (desktop exe). Same code, same
frontend, no changes needed either way.

**One-time setup:**
1. Push this repo to GitHub (already done if you're reading this from there).
2. Go to [render.com](https://render.com) and sign up (free, no credit card needed for the free tier).
3. Click **New > Blueprint**, pick this repo. Render will detect `render.yaml` at the repo root
   and provision both the web service and a free Postgres database automatically, wiring
   `DATABASE_URL` and a random `SECRET_KEY` for you.
4. Click **Apply**. First build takes a few minutes; after that you get a public URL
   (`https://sports-stats-app-xxxx.onrender.com`) anyone can open in a browser — no exe, no install.

**Things to know:**
- Free web services spin down after ~15 minutes idle; the next visit takes ~30-50 seconds to
  wake back up. Fine for a multi-day group project, not for "always instant."
- Render's free Postgres plan is time-limited (currently 30 days) — plenty for a short-term use
  case, but not meant as permanent storage.
- To shut it down when you're done, delete the Blueprint (both the web service and database) from
  the Render dashboard so it stops counting against your free usage.
- The cloud deployment uses `requirements-cloud.txt` (Flask, requests, gunicorn, psycopg2-binary,
  google-generativeai — no pywebview, since there's no desktop window in the cloud) and `Procfile`
  (`gunicorn app:app`) instead of the desktop `requirements.txt`.
- To enable AI Coach on the cloud deploy, add a `GEMINI_API_KEY` environment variable in the
  service's Environment tab (the local key-file fallback won't persist across free-tier restarts,
  same reasoning as `SECRET_KEY`). Without it, the Coach tab just shows a setup reminder instead
  of erroring — the rest of the app works fine either way.

## Project structure

```
app.py               Flask app: routes, auth, TheSportsDB fetch/cache, projections math,
                      and the pywebview window that hosts it all
db.py                DB access layer — SQLite locally, Postgres in the cloud (auto-detected via
                      DATABASE_URL) — schema (users, stat_logs), user/stat CRUD, leaderboard query
render.yaml           Render Blueprint: defines the free web service + free Postgres database
Procfile              Cloud start command (gunicorn app:app)
requirements-cloud.txt Cloud-only dependencies (adds gunicorn + psycopg2-binary, drops pywebview)
metrics.py           Catalog of loggable metrics per sport (key, label, unit, higher/lower-is-better)
templates/index.html Single-page HTML shell the frontend renders into
static/script.js     Frontend logic — tabs, search, compare, leaderboard, projections, sparkline
static/style.css     App styling (CSS custom properties for colors, layout, components)
requirements.txt     Python dependencies (Flask, requests, pywebview, google-generativeai)
dist/                Built standalone .exe (generated, not meant to be hand-edited)
```

## Features

- **Login / Sign up** — accounts are local to your machine (SQLite), passwords hashed with
  werkzeug's `generate_password_hash`.
- **Your Stats** — log sport-specific metrics over time (mile time, 40-yard dash, vertical jump,
  bench press, batting average, driving distance, etc. — see `metrics.py` for the full catalog
  per sport) and view your history.
- **Player Stats** — search any team or player; team pages show overview, roster, recent
  results, upcoming fixtures, and league standings; player pages show bio info.
- **Compare** — search an athlete and compare your saved height/weight/age against theirs with a
  bar chart (prefilled from your last saved Bio stats in Your Stats).
- **Leaderboard** — for any sport + metric that at least one user has logged, ranks all users by
  their latest value (lower-is-better metrics like times rank ascending, higher-is-better metrics
  like bench press rank descending).
- **Projections** — pick a metric you've logged at least twice (spanning at least a day). The
  trend is a weighted regression (entries logged with more rest days count more, since a fatigued
  measurement is a noisier read on your true current level), adjusted by a heuristic age factor
  (from your logged Bio age, if any), then projected forward with a diminishing-returns curve that
  levels off over time instead of extending in a straight line — 30/90/365-day estimates, plus a
  sparkline of your history.
- **AI Coach** — a free-form chat coach (Google Gemini) that gives advice based on your actual
  logged stats. Not scripted/pre-programmed responses — see "AI Coach setup" below to enable it.

## AI Coach setup

The Coach tab calls Google's **Gemini API free tier** — no cost, no credit card, but each person
running the app needs their own personal API key (keys are never shared or synced):

1. Go to [aistudio.google.com](https://aistudio.google.com), sign in, and generate a free API key.
2. Give it to the app one of two ways:
   - Set it as an environment variable named `GEMINI_API_KEY`, **or**
   - Save it as plain text (no quotes, just the key) to
     `%LOCALAPPDATA%\SportsStatsApp\gemini_api_key.txt`
3. Restart the app. The Coach tab will now work; without a key it shows a setup reminder instead
   of erroring.

Nothing about this key is committed to the repo or bundled into the `.exe` — it only lives on
each person's own machine.

If the Coach ever errors with a `429 quota exceeded, limit: 0` message, the model name in
`app.py` (`GEMINI_MODEL`) has likely been retired from the free tier — Google rotates which
models get free quota. Swap it for whatever `gemini-*-latest` alias is current at
[aistudio.google.com](https://aistudio.google.com).

## Data & storage

- **Desktop exe:** user accounts and stat logs are stored in a local SQLite database at
  `%LOCALAPPDATA%\SportsStatsApp\data.db` (not in this repo, not synced anywhere). The session
  signing key is stored alongside it at `%LOCALAPPDATA%\SportsStatsApp\secret.key`.
- **Cloud (Render):** accounts and stat logs live in the linked Postgres database instead, shared
  by everyone who uses the deployed URL — that's what makes the leaderboard actually shared. The
  session signing key comes from the `SECRET_KEY` environment variable Render generates, not a
  local file (a local file would reset every time the free-tier container restarts).

## Notes

- Uses TheSportsDB's free test API key (`123`), rate-limited to 30 requests/minute.
- Responses from TheSportsDB are cached in-memory for 5 minutes to stay under the rate limit.
- TheSportsDB's free tier covers team/player bios, rosters, schedules, results, and league
  standings — it does not include deep box-score stats (points per game, etc.). That's why
  personal performance metrics (mile time, vertical jump, etc.) are self-logged by users rather
  than pulled from the API.
- Projections use a rest-day-weighted, age-adjusted, diminishing-returns model over your own
  logged history — a heuristic estimate, not a physiological/scientific prediction.
- Colors are set via CSS custom properties at the top of `static/style.css` (`--bg`, `--text`,
  `--accent`, etc.) — the app currently uses a fixed light-blue/dark-blue palette regardless of
  OS theme.
- The login screen has scattered sport emoji decorations (soccer, basketball, football, baseball,
  tennis, hockey, golf, boxing) behind the auth box, styled via `.sports-decor` in `style.css`.
