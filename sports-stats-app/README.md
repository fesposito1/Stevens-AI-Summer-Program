# Sports Stats Search

Desktop app (Flask + a native window via pywebview) to look up teams and players across sports
(soccer, basketball, football, hockey, baseball, golf, tennis, and more) using TheSportsDB free
API, plus your own account for logging sport-specific personal stats, comparing yourself to pro
athletes, a leaderboard against other users, and simple trend projections.

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

## Data & storage

- User accounts and stat logs are stored in a local SQLite database at
  `%LOCALAPPDATA%\SportsStatsApp\data.db` (not in this repo, not synced anywhere).
- The session signing key is stored alongside it at `%LOCALAPPDATA%\SportsStatsApp\secret.key`.

## Notes

- Uses TheSportsDB's free test API key (`123`), rate-limited to 30 requests/minute.
- Responses from TheSportsDB are cached in-memory for 5 minutes to stay under the rate limit.
- TheSportsDB's free tier covers team/player bios, rosters, schedules, results, and league
  standings — it does not include deep box-score stats (points per game, etc.). That's why
  personal performance metrics (mile time, vertical jump, etc.) are self-logged by users rather
  than pulled from the API.
- Projections use a rest-day-weighted, age-adjusted, diminishing-returns model over your own
  logged history — a heuristic estimate, not a physiological/scientific prediction.
