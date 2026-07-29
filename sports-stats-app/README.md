# Sports Stats Search

Flask app with a search bar to look up teams and players across sports (soccer, basketball,
football, hockey, baseball, golf, tennis, and more) using TheSportsDB free API.

## Run it

```
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000

## Build a standalone .exe

```
pip install pyinstaller
pyinstaller --onefile --name SportsStatsApp --add-data "templates;templates" --add-data "static;static" app.py
```

The exe is written to `dist/SportsStatsApp.exe`. Double-click it — it starts the server and
opens your browser to the app automatically. No Python install needed on the machine running it.

## Features

- Search any team or player across sports.
- Team pages show overview, roster, recent results, upcoming fixtures, and league standings.
- Player pages show overview plus a "Compare Your Stats" tool — enter your own height/weight/age
  and see a side-by-side bar comparison against the selected athlete.

## Notes

- Uses TheSportsDB's free test API key (`123`), rate-limited to 30 requests/minute.
- Responses are cached in-memory for 5 minutes to stay under the rate limit.
- Free tier covers team/player bios, rosters, schedules, results, and league standings.
  It does not include deep box-score stats (points per game, etc.) — that requires
  TheSportsDB's paid tier.
