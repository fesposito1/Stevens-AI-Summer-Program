from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from threading import Lock
import time

import requests
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

API_KEY = "123"
BASE_URL = f"https://www.thesportsdb.com/api/v1/json/{API_KEY}"
REQUEST_TIMEOUT = 10

_cache = {}
_cache_lock = Lock()
CACHE_TTL_SECONDS = 300


class RateLimitError(Exception):
    pass


def sportsdb_get(endpoint, params=None):
    url = f"{BASE_URL}/{endpoint}"
    cache_key = (url, tuple(sorted((params or {}).items())))

    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]

    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
    if response.status_code == 429:
        raise RateLimitError("TheSportsDB rate limit reached, try again shortly.")
    response.raise_for_status()
    data = response.json()

    with _cache_lock:
        _cache[cache_key] = (time.time(), data)
    return data


def fetch_all(calls):
    """Run named sportsdb_get calls concurrently. calls: dict[name] -> (endpoint, params)."""
    results = {}
    with ThreadPoolExecutor(max_workers=max(len(calls), 1)) as executor:
        futures = {
            name: executor.submit(sportsdb_get, endpoint, params)
            for name, (endpoint, params) in calls.items()
        }
        for name, future in futures.items():
            try:
                results[name] = future.result()
            except RateLimitError:
                raise
            except Exception:
                results[name] = None
    return results


def season_candidates():
    year = datetime.now().year
    return [f"{year - 1}-{year}", f"{year}-{year + 1}", str(year), str(year - 1)]


def team_summary(team):
    return {
        "type": "team",
        "id": team.get("idTeam"),
        "name": team.get("strTeam"),
        "sport": team.get("strSport"),
        "league": team.get("strLeague"),
        "thumb": team.get("strBadge"),
    }


def player_summary(player):
    return {
        "type": "player",
        "id": player.get("idPlayer"),
        "name": player.get("strPlayer"),
        "sport": player.get("strSport"),
        "team": player.get("strTeam"),
        "thumb": player.get("strThumb") or player.get("strCutout"),
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/search")
def search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"results": []})

    try:
        data = fetch_all({
            "teams": ("searchteams.php", {"t": query}),
            "players": ("searchplayers.php", {"p": query}),
        })
    except RateLimitError as exc:
        return jsonify({"error": str(exc)}), 429

    results = []
    for team in (data["teams"] or {}).get("teams") or []:
        results.append(team_summary(team))
    for player in (data["players"] or {}).get("player") or []:
        results.append(player_summary(player))

    return jsonify({"results": results})


@app.route("/api/team/<team_id>")
def team_detail(team_id):
    try:
        base = fetch_all({
            "info": ("lookupteam.php", {"id": team_id}),
            "roster": ("lookup_all_players.php", {"id": team_id}),
            "last_events": ("eventslast.php", {"id": team_id}),
            "next_events": ("eventsnext.php", {"id": team_id}),
        })
    except RateLimitError as exc:
        return jsonify({"error": str(exc)}), 429

    info_list = (base["info"] or {}).get("teams") or []
    if not info_list:
        return jsonify({"error": "Team not found"}), 404
    info = info_list[0]

    table = []
    league_id = info.get("idLeague")
    if league_id:
        for season in season_candidates():
            try:
                table_data = sportsdb_get("lookuptable.php", {"l": league_id, "s": season})
            except RateLimitError as exc:
                return jsonify({"error": str(exc)}), 429
            rows = (table_data or {}).get("table") or []
            if rows:
                table = rows
                break

    return jsonify({
        "info": {
            "name": info.get("strTeam"),
            "sport": info.get("strSport"),
            "league": info.get("strLeague"),
            "country": info.get("strCountry"),
            "stadium": info.get("strStadium"),
            "formed": info.get("intFormedYear"),
            "website": info.get("strWebsite"),
            "description": info.get("strDescriptionEN"),
            "badge": info.get("strBadge"),
            "banner": info.get("strBanner"),
        },
        "roster": [
            {
                "id": p.get("idPlayer"),
                "name": p.get("strPlayer"),
                "position": p.get("strPosition") or p.get("strStatus"),
                "nationality": p.get("strNationality"),
                "thumb": p.get("strThumb") or p.get("strCutout"),
            }
            for p in (base["roster"] or {}).get("player") or []
        ],
        "last_events": [
            {
                "event": e.get("strEvent"),
                "date": e.get("dateEvent"),
                "home_team": e.get("strHomeTeam"),
                "away_team": e.get("strAwayTeam"),
                "home_score": e.get("intHomeScore"),
                "away_score": e.get("intAwayScore"),
                "league": e.get("strLeague"),
            }
            for e in (base["last_events"] or {}).get("results") or (base["last_events"] or {}).get("events") or []
        ],
        "next_events": [
            {
                "event": e.get("strEvent"),
                "date": e.get("dateEvent"),
                "time": e.get("strTime"),
                "home_team": e.get("strHomeTeam"),
                "away_team": e.get("strAwayTeam"),
                "league": e.get("strLeague"),
            }
            for e in (base["next_events"] or {}).get("events") or []
        ],
        "table": [
            {
                "rank": row.get("intRank"),
                "team": row.get("strTeam"),
                "played": row.get("intPlayed"),
                "win": row.get("intWin"),
                "draw": row.get("intDraw"),
                "loss": row.get("intLoss"),
                "points": row.get("intPoints"),
            }
            for row in table
        ],
    })


@app.route("/api/player/<player_id>")
def player_detail(player_id):
    try:
        base = fetch_all({
            "info": ("lookupplayer.php", {"id": player_id}),
        })
    except RateLimitError as exc:
        return jsonify({"error": str(exc)}), 429

    info_list = (base["info"] or {}).get("players") or []
    if not info_list:
        return jsonify({"error": "Player not found"}), 404
    info = info_list[0]

    team_id = info.get("idTeam")
    team_events = {"last_events": None, "next_events": None}
    if team_id:
        try:
            team_events = fetch_all({
                "last_events": ("eventslast.php", {"id": team_id}),
                "next_events": ("eventsnext.php", {"id": team_id}),
            })
        except RateLimitError as exc:
            return jsonify({"error": str(exc)}), 429

    return jsonify({
        "info": {
            "name": info.get("strPlayer"),
            "sport": info.get("strSport"),
            "team": info.get("strTeam"),
            "position": info.get("strPosition"),
            "nationality": info.get("strNationality"),
            "born": info.get("dateBorn"),
            "status": info.get("strStatus"),
            "height": info.get("strHeight"),
            "weight": info.get("strWeight"),
            "description": info.get("strDescriptionEN"),
            "thumb": info.get("strThumb") or info.get("strCutout"),
            "banner": info.get("strBanner"),
        },
        "last_events": [
            {
                "event": e.get("strEvent"),
                "date": e.get("dateEvent"),
                "home_team": e.get("strHomeTeam"),
                "away_team": e.get("strAwayTeam"),
                "home_score": e.get("intHomeScore"),
                "away_score": e.get("intAwayScore"),
                "league": e.get("strLeague"),
            }
            for e in (team_events["last_events"] or {}).get("results") or (team_events["last_events"] or {}).get("events") or []
        ] if team_id else [],
        "next_events": [
            {
                "event": e.get("strEvent"),
                "date": e.get("dateEvent"),
                "time": e.get("strTime"),
                "home_team": e.get("strHomeTeam"),
                "away_team": e.get("strAwayTeam"),
                "league": e.get("strLeague"),
            }
            for e in (team_events["next_events"] or {}).get("events") or []
        ] if team_id else [],
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
