from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import wraps
from threading import Lock, Thread
import logging
import os
import re
import sys
import time

import requests
import webview
from flask import Flask, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import db
from metrics import SPORT_METRICS, metric_lookup


def resource_path(relative_path):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative_path)


def load_or_create_secret_key():
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        return env_key.encode()

    path = os.path.join(db.data_dir(), "secret.key")
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    key = os.urandom(32)
    with open(path, "wb") as f:
        f.write(key)
    return key


app = Flask(
    __name__,
    template_folder=resource_path("templates"),
    static_folder=resource_path("static"),
)
app.secret_key = load_or_create_secret_key()
app.config["SESSION_COOKIE_NAME"] = "sportsstats_session"
db.init_db()

API_KEY = "123"
BASE_URL = f"https://www.thesportsdb.com/api/v1/json/{API_KEY}"
REQUEST_TIMEOUT = 10

_cache = {}
_cache_lock = Lock()
CACHE_TTL_SECONDS = 300


class RateLimitError(Exception):
    pass


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Login required"}), 401
        return f(*args, **kwargs)
    return wrapper


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
    try:
        data = response.json()
    except ValueError:
        data = None

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


def parse_height_cm(raw):
    if not raw:
        return None
    match = re.search(r"(\d+\.\d+)\s*m\b", raw, re.IGNORECASE)
    if match:
        return round(float(match.group(1)) * 100, 1)
    match = re.search(r"(\d+)\s*cm", raw, re.IGNORECASE)
    if match:
        return float(match.group(1))
    match = re.search(r"(\d+)\s*(?:ft|')\s*(\d+)?\s*(?:in|\")?", raw, re.IGNORECASE)
    if match:
        feet = float(match.group(1))
        inches = float(match.group(2)) if match.group(2) else 0.0
        return round(feet * 30.48 + inches * 2.54, 1)
    return None


def parse_weight_kg(raw):
    if not raw:
        return None
    match = re.search(r"(\d+\.?\d*)\s*kg", raw, re.IGNORECASE)
    if match:
        return float(match.group(1))
    match = re.search(r"(\d+\.?\d*)\s*lbs?\b", raw, re.IGNORECASE)
    if match:
        return round(float(match.group(1)) / 2.20462, 1)
    return None


def calc_age(date_born):
    if not date_born:
        return None
    try:
        born = datetime.strptime(date_born, "%Y-%m-%d")
    except ValueError:
        return None
    today = datetime.now()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def weighted_linear_regression(points):
    """points: list of (x, y, weight). Well-rested entries (higher weight) count more,
    since a fatigued measurement is a noisier read on someone's true current level."""
    n = len(points)
    if n < 2:
        return None
    sum_w = sum(w for _, _, w in points)
    sum_wx = sum(w * x for x, _, w in points)
    sum_wy = sum(w * y for _, y, w in points)
    sum_wxy = sum(w * x * y for x, y, w in points)
    sum_wx2 = sum(w * x * x for x, _, w in points)
    denom = sum_w * sum_wx2 - sum_wx ** 2
    if denom == 0:
        return None
    slope = (sum_w * sum_wxy - sum_wx * sum_wy) / denom
    intercept = (sum_wy - slope * sum_wx) / sum_w
    return slope, intercept


def age_adjustment_factor(age):
    """Rough heuristic, not a physiological model: younger users tend to have more
    headroom to keep improving quickly, older users tend to see slower marginal gains."""
    if age is None:
        return 1.0
    if age < 18:
        return 1.2
    if age < 30:
        return 1.0
    if age < 40:
        return 0.85
    if age < 50:
        return 0.7
    return 0.55


def get_latest_bio_age(user_id):
    rows = db.get_stats_for_user(user_id, metric_key="age")
    if not rows:
        return None
    return rows[-1]["value"]


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


# ---------- Auth ----------

@app.route("/api/auth/signup", methods=["POST"])
def signup():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400
    if db.get_user_by_username(username):
        return jsonify({"error": "That username is already taken."}), 409

    user_id = db.create_user(username, generate_password_hash(password), datetime.now().isoformat())
    session.permanent = True
    session["user_id"] = user_id
    session["username"] = username
    return jsonify({"username": username})


@app.route("/api/auth/login", methods=["POST"])
def login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    user = db.get_user_by_username(username)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid username or password."}), 401

    session.permanent = True
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    return jsonify({"username": user["username"]})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/me")
def auth_me():
    if "user_id" not in session:
        return jsonify({"username": None})
    return jsonify({"username": session.get("username")})


# ---------- Metrics catalog ----------

@app.route("/api/metrics/catalog")
def metrics_catalog():
    return jsonify({"sports": SPORT_METRICS})


# ---------- Stats logging ----------

@app.route("/api/stats", methods=["POST"])
@login_required
def log_stat():
    payload = request.get_json(silent=True) or {}
    sport = payload.get("sport")
    metric_key = payload.get("metric_key")
    value = payload.get("value")

    metric = metric_lookup(sport, metric_key)
    if not metric:
        return jsonify({"error": "Unknown sport/metric combination."}), 400
    try:
        value = float(value)
    except (TypeError, ValueError):
        return jsonify({"error": "Value must be a number."}), 400

    rest_days = payload.get("rest_days")
    try:
        rest_days = max(0.0, float(rest_days)) if rest_days not in (None, "") else 0.0
    except (TypeError, ValueError):
        rest_days = 0.0

    db.add_stat_log(
        session["user_id"], sport, metric_key, metric["label"], metric["unit"], metric["direction"],
        value, datetime.now().isoformat(), rest_days,
    )
    return jsonify({"ok": True})


@app.route("/api/stats/me")
@login_required
def stats_me():
    return jsonify({"stats": db.get_stats_for_user(session["user_id"])})


# ---------- Leaderboard ----------

@app.route("/api/leaderboard/options")
@login_required
def leaderboard_options():
    return jsonify({"options": db.get_leaderboard_options()})


@app.route("/api/leaderboard")
@login_required
def leaderboard():
    sport = request.args.get("sport")
    metric_key = request.args.get("metric_key")
    if not sport or not metric_key:
        return jsonify({"error": "sport and metric_key are required."}), 400
    return jsonify({"entries": db.get_leaderboard(sport, metric_key)})


# ---------- Projections ----------

@app.route("/api/projections/me")
@login_required
def projections_me():
    metric_key = request.args.get("metric_key")
    if not metric_key:
        return jsonify({"error": "metric_key is required."}), 400

    rows = db.get_stats_for_user(session["user_id"], metric_key=metric_key)
    if len(rows) < 2:
        return jsonify({"error": "Log at least 2 entries for this metric to see a projection."}), 400

    first_ts = datetime.fromisoformat(rows[0]["recorded_at"])
    points = []
    for row in rows:
        ts = datetime.fromisoformat(row["recorded_at"])
        days = (ts - first_ts).total_seconds() / 86400
        rest_days = row.get("rest_days") or 0
        weight = 1 + min(rest_days, 7) / 7  # well-rested entries count up to 2x
        points.append((days, row["value"], weight))

    last_day = points[-1][0]
    if last_day < 1:
        return jsonify({"error": "Your logged entries are too close together in time to project a reliable trend — log entries on different days."}), 400

    reg = weighted_linear_regression(points)
    if not reg:
        return jsonify({"error": "Not enough variation in your logged values to project a trend."}), 400
    raw_slope, _intercept = reg

    age = get_latest_bio_age(session["user_id"])
    age_factor = age_adjustment_factor(age)
    adjusted_slope = raw_slope * age_factor

    last_value = points[-1][1]
    # Diminishing-returns (saturating) curve rather than unbounded linear extrapolation:
    # the effective rate tapers off as the horizon grows, approaching an asymptote of
    # last_value + adjusted_slope * TAU rather than climbing forever.
    TAU = 60.0
    projections = []
    for horizon in (30, 90, 365):
        change = adjusted_slope * TAU * horizon / (TAU + horizon)
        projections.append({"days_from_now": horizon, "value": round(last_value + change, 2)})

    return jsonify({
        "metric": {
            "key": metric_key,
            "label": rows[0]["label"],
            "unit": rows[0]["unit"],
            "direction": rows[0]["direction"],
        },
        "history": [{"date": r["recorded_at"], "value": r["value"], "rest_days": r.get("rest_days") or 0} for r in rows],
        "trend_per_day": round(raw_slope, 5),
        "adjusted_trend_per_day": round(adjusted_slope, 5),
        "age_used": age,
        "age_factor": age_factor,
        "model_note": (
            "Rest-day-weighted trend, adjusted for age, projected with a diminishing-returns "
            "curve that levels off over time rather than extending in a straight line. "
            "A heuristic estimate, not a physiological model."
        ),
        "projections": projections,
    })


# ---------- TheSportsDB lookups ----------

@app.route("/api/search")
def search():
    query = request.args.get("q", "").strip()
    only_type = request.args.get("type")
    if not query:
        return jsonify({"results": []})

    calls = {}
    if only_type != "player":
        calls["teams"] = ("searchteams.php", {"t": query})
    if only_type != "team":
        calls["players"] = ("searchplayers.php", {"p": query})

    try:
        data = fetch_all(calls)
    except RateLimitError as exc:
        return jsonify({"error": str(exc)}), 429

    results = []
    for team in (data.get("teams") or {}).get("teams") or []:
        results.append(team_summary(team))
    for player in (data.get("players") or {}).get("player") or []:
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
            "height_cm": parse_height_cm(info.get("strHeight")),
            "weight_kg": parse_weight_kg(info.get("strWeight")),
            "age": calc_age(info.get("dateBorn")),
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
    PORT = 5000
    logging.getLogger("werkzeug").setLevel(logging.ERROR)

    server_thread = Thread(
        target=lambda: app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False),
        daemon=True,
    )
    server_thread.start()

    webview.create_window(
        "Sports Stats Search",
        f"http://127.0.0.1:{PORT}",
        width=1100,
        height=780,
        min_size=(700, 500),
    )
    webview.start()
