# Sports Stats Search

A Flask web app to look up teams and players across sports (soccer, basketball, football,
hockey, baseball, golf, tennis, MMA/boxing, and more) using TheSportsDB free API, plus your own
account for logging sport-specific personal stats, comparing yourself to pro athletes, a
leaderboard shared across everyone using the app, an AI coach, and simple trend projections.

## Live app

**https://sports-stats-app-1sqi.onrender.com/**

Just open it in a browser and create an account. Everyone who signs up shares the same
leaderboard. (Free-tier hosting: the first visit after ~15 minutes of inactivity takes 30-50
seconds to wake back up — that's normal, not broken.)

## Run from source (local development)

```
pip install -r requirements.txt
python app.py
```

This opens a native desktop window (via pywebview) pointed at a local Flask server — handy for
development/testing without needing to redeploy. `db.py` auto-detects the backend: no
`DATABASE_URL` set means it uses a local SQLite file; this is separate from the shared Postgres
database the live app uses.

## Redeploying / cloud setup

The app is already deployed on Render via the `render.yaml` Blueprint in this repo. Every push to
`main` auto-deploys (Render → service → Settings → Build & Deploy → Auto-Deploy). To set it up
from scratch on a different Render account:
1. Push this repo to GitHub (already done if you're reading this from there).
2. Go to [render.com](https://render.com) and sign up (free, no credit card needed for the free tier).
3. Click **New > Blueprint**, pick this repo. Render will detect `render.yaml` at the repo root
   and provision both the web service and a free Postgres database automatically, wiring
   `DATABASE_URL` and a random `SECRET_KEY` for you.
4. Click **Apply**. First build takes a few minutes; after that you get a public URL anyone can
   open in a browser.

**Things to know:**
- Free web services spin down after ~15 minutes idle; the next visit takes ~30-50 seconds to
  wake back up.
- Render's free Postgres plan is time-limited (currently 30 days) — fine for short-term use, not
  meant as permanent storage.
- To shut it down, delete the Blueprint (both the web service and database) from the Render
  dashboard so it stops counting against your free usage.
- The cloud deployment uses `requirements-cloud.txt` (Flask, requests, gunicorn, psycopg2-binary,
  google-generativeai — no pywebview, since there's no desktop window in the cloud) and `Procfile`
  (`gunicorn app:app`) instead of the local-dev `requirements.txt`.
- To enable AI Coach on the cloud deploy, add a `GEMINI_API_KEY` environment variable in the
  service's Environment tab (the local key-file fallback won't persist across free-tier restarts,
  same reasoning as `SECRET_KEY`). Without it, the Coach tab just shows a setup reminder instead
  of erroring — the rest of the app works fine either way.

## Project structure

```
app.py               Flask app: routes, auth, TheSportsDB fetch/cache, projections math, AI Coach,
                      and the pywebview window used for local dev
db.py                DB access layer — SQLite locally, Postgres in the cloud (auto-detected via
                      DATABASE_URL) — schema (users, stat_logs), user/stat CRUD, leaderboard query
render.yaml           Render Blueprint: defines the free web service + free Postgres database
Procfile              Cloud start command (gunicorn app:app)
requirements-cloud.txt Cloud-only dependencies (adds gunicorn + psycopg2-binary, drops pywebview)
metrics.py           Catalog of loggable metrics per sport (key, label, unit, higher/lower-is-better)
templates/index.html Single-page HTML shell the frontend renders into
static/script.js     Frontend logic — tabs, search, compare, leaderboard, projections, sparkline
static/style.css     App styling (CSS custom properties for colors, layout, components)
requirements.txt     Local-dev Python dependencies (Flask, requests, pywebview, google-generativeai)
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

The Coach tab calls Google's **Gemini API free tier** — no cost, no credit card. How the key
gets configured differs depending on how you're running the app:

**Desktop exe / running from source locally** — each person needs their own personal key:

1. Go to [aistudio.google.com](https://aistudio.google.com), sign in, and generate a free API key.
2. Give it to the app one of two ways:
   - Set it as an environment variable named `GEMINI_API_KEY`, **or**
   - Save it as plain text (no quotes, just the key) to
     `%LOCALAPPDATA%\SportsStatsApp\gemini_api_key.txt`
3. Restart the app. The Coach tab will now work; without a key it shows a setup reminder instead
   of erroring.

Nothing about this key is committed to the repo — it only lives on each person's own machine (for
local dev) or as a Render environment variable (for the live app).

**Cloud (Render) deployment** — there's only *one* running backend serving every visitor, so
**only the person who deployed it sets a key, once** — visitors never need their own:

1. In the Render dashboard, open the web service → **Environment**.
2. Add an environment variable `GEMINI_API_KEY` with your own free key from
   [aistudio.google.com](https://aistudio.google.com) as the value, then save (Render redeploys
   automatically). `render.yaml` already declares this variable (`sync: false`), so Render also
   prompts for it the first time the Blueprint is applied on a fresh deploy.
3. That's it — every visitor to the site now gets Coach access with no setup of their own.

If the Coach ever errors with a `429 quota exceeded, limit: 0` message, the model name in
`app.py` (`GEMINI_MODEL`) has likely been retired from the free tier — Google rotates which
models get free quota. Swap it for whatever `gemini-*-latest` alias is current at
[aistudio.google.com](https://aistudio.google.com).

## Data & storage

- **Local dev (`python app.py`):** user accounts and stat logs are stored in a local SQLite
  database at `%LOCALAPPDATA%\SportsStatsApp\data.db` (not in this repo, not synced anywhere).
  The session signing key is stored alongside it at `%LOCALAPPDATA%\SportsStatsApp\secret.key`.
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
