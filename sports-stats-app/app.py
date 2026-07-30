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
from flask import Flask, jsonify, render_template, request, session

try:
    import google.generativeai as genai
except ImportError:
    genai = None
from werkzeug.security import check_password_hash, generate_password_hash

import db
from metrics import SPORT_METRICS, metric_lookup, GAME_METRIC_KEYS_BY_SPORT


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

# AI Coach — Google Gemini, free tier, no shared key needed (each user brings their own)
GEMINI_MODEL = "gemini-flash-latest"
COACH_COOLDOWN_SECONDS = 2.0
_coach_last_call = {}
_coach_lock = Lock()
DEFAULT_COACH_SYSTEM_PROMPT = (
    "You are an encouraging, knowledgeable sports performance coach embedded in a "
    "stats-tracking app. Give specific, actionable advice based on the athlete's own "
    "logged stats below — reference real numbers when relevant. Keep replies "
    "conversational and concise (roughly 3-6 sentences) unless asked for more detail. "
    "You are not a doctor; suggest consulting one for injury or medical concerns."
)

SECURITY_QUESTION = "What sport do you play or follow most?"
ADMIN_USERNAME = "admin"
ADMIN_DEFAULT_PASSWORD = "123456"


def ensure_admin_account():
    if db.get_user_by_username(ADMIN_USERNAME):
        return
    db.create_user(
        ADMIN_USERNAME,
        generate_password_hash(ADMIN_DEFAULT_PASSWORD, method="pbkdf2:sha256"),
        datetime.now().isoformat(),
        is_admin=1,
    )


ensure_admin_account()


class RateLimitError(Exception):
    pass


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Login required"}), 401
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Login required"}), 401
        if not session.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
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


def gemini_key_path():
    return os.path.join(db.data_dir(), "gemini_api_key.txt")


def get_gemini_api_key():
    key = os.environ.get("GEMINI_API_KEY")
    if key and key.strip():
        return key.strip()
    path = gemini_key_path()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            key = f.read().strip()
        return key or None
    return None


def build_coach_context(stats):
    if not stats:
        return "This athlete hasn't logged any stats yet — encourage them to log some in Your Stats."
    lines = [
        f"- {s['sport']} / {s['label']}: {s['value']}{s['unit']} (logged {s['recorded_at'][:10]})"
        for s in stats[:30]
    ]
    return "Recently logged stats (most recent first):\n" + "\n".join(lines)


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
    security_answer = (payload.get("security_answer") or "").strip()

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400
    if not security_answer:
        return jsonify({"error": "A security question answer is required (used for password resets)."}), 400
    if db.get_user_by_username(username):
        return jsonify({"error": "That username is already taken."}), 409

    user_id = db.create_user(
        username,
        generate_password_hash(password, method="pbkdf2:sha256"),
        datetime.now().isoformat(),
        security_question=SECURITY_QUESTION,
        security_answer_hash=generate_password_hash(security_answer.lower(), method="pbkdf2:sha256"),
    )
    session.permanent = True
    session["user_id"] = user_id
    session["username"] = username
    session["is_admin"] = False
    return jsonify({"username": username, "is_admin": False})


@app.route("/api/auth/login", methods=["POST"])
def login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    user = db.get_user_by_username(username)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid username or password."}), 401

    db.update_last_login(user["id"], datetime.now().isoformat())

    session.permanent = True
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["is_admin"] = bool(user.get("is_admin"))
    return jsonify({"username": user["username"], "is_admin": bool(user.get("is_admin"))})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/me")
def auth_me():
    if "user_id" not in session:
        return jsonify({"username": None})
    return jsonify({"username": session.get("username"), "is_admin": bool(session.get("is_admin"))})


# ---------- Forgot password ----------

@app.route("/api/auth/forgot/question", methods=["POST"])
def forgot_question():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    user = db.get_user_by_username(username)
    if not user or not user.get("security_question"):
        return jsonify({"error": "No account with a security question found for that username."}), 404
    return jsonify({"question": user["security_question"]})


@app.route("/api/auth/forgot/reset", methods=["POST"])
def forgot_reset():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    answer = (payload.get("answer") or "").strip()
    new_password = payload.get("new_password") or ""

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 400

    user = db.get_user_by_username(username)
    if not user or not user.get("security_answer_hash"):
        return jsonify({"error": "No account with a security question found for that username."}), 404
    if not check_password_hash(user["security_answer_hash"], answer.lower()):
        return jsonify({"error": "That answer doesn't match."}), 401

    db.update_user_password(user["id"], generate_password_hash(new_password, method="pbkdf2:sha256"))
    return jsonify({"ok": True})


# ---------- Admin ----------

@app.route("/api/admin/users")
@admin_required
def admin_list_users():
    return jsonify({"users": db.get_all_users()})


@app.route("/api/admin/users/<int:user_id>/reset-password", methods=["POST"])
@admin_required
def admin_reset_password(user_id):
    payload = request.get_json(silent=True) or {}
    new_password = payload.get("new_password") or ""
    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 400
    if not db.get_user_by_id(user_id):
        return jsonify({"error": "User not found."}), 404
    db.update_user_password(user_id, generate_password_hash(new_password, method="pbkdf2:sha256"))
    return jsonify({"ok": True})


@app.route("/api/admin/users/<int:user_id>/rename", methods=["POST"])
@admin_required
def admin_rename_user(user_id):
    payload = request.get_json(silent=True) or {}
    new_username = (payload.get("new_username") or "").strip()
    if len(new_username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if not db.get_user_by_id(user_id):
        return jsonify({"error": "User not found."}), 404
    if db.get_user_by_username(new_username):
        return jsonify({"error": "That username is already taken."}), 409
    db.rename_user(user_id, new_username)
    if session.get("user_id") == user_id:
        session["username"] = new_username
    return jsonify({"ok": True})


@app.route("/api/admin/settings")
@admin_required
def admin_get_settings():
    return jsonify({
        "coach_system_prompt": db.get_setting("coach_system_prompt", DEFAULT_COACH_SYSTEM_PROMPT),
    })


@app.route("/api/admin/settings", methods=["POST"])
@admin_required
def admin_set_settings():
    payload = request.get_json(silent=True) or {}
    prompt = payload.get("coach_system_prompt")
    if prompt is not None:
        db.set_setting("coach_system_prompt", prompt)
    return jsonify({"ok": True})


# ---------- Metrics catalog ----------

@app.route("/api/metrics/catalog")
def metrics_catalog():
    return jsonify({"sports": SPORT_METRICS, "game_metric_keys": GAME_METRIC_KEYS_BY_SPORT})


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


# ---------- Schedule (matches & practices) ----------

@app.route("/api/events", methods=["POST"])
@login_required
def create_event():
    payload = request.get_json(silent=True) or {}
    event_date = (payload.get("event_date") or "").strip()
    event_time = (payload.get("event_time") or "").strip() or None
    event_type = payload.get("event_type")
    sport = payload.get("sport")
    opponent = (payload.get("opponent") or "").strip() or None
    notes = (payload.get("notes") or "").strip() or None

    if event_type not in ("match", "practice"):
        return jsonify({"error": "event_type must be 'match' or 'practice'."}), 400
    if sport not in GAME_METRIC_KEYS_BY_SPORT:
        return jsonify({"error": "Unknown or unsupported sport."}), 400
    try:
        datetime.strptime(event_date, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "event_date must be YYYY-MM-DD."}), 400
    if event_time is not None:
        try:
            datetime.strptime(event_time, "%H:%M")
        except ValueError:
            return jsonify({"error": "event_time must be HH:MM."}), 400

    event_id = db.add_event(
        session["user_id"], event_date, event_type, sport, opponent, notes, datetime.now().isoformat(),
        event_time=event_time,
    )
    return jsonify({"id": event_id})


@app.route("/api/events/me")
@login_required
def events_me():
    return jsonify({"events": db.get_events_for_user(session["user_id"])})


@app.route("/api/events/today")
@login_required
def events_today():
    today = datetime.now().strftime("%Y-%m-%d")
    return jsonify({"date": today, "events": db.get_events_on_date(session["user_id"], today)})


@app.route("/api/events/<int:event_id>", methods=["DELETE"])
@login_required
def delete_event_route(event_id):
    if not db.get_event(event_id, session["user_id"]):
        return jsonify({"error": "Event not found."}), 404
    db.delete_event(event_id, session["user_id"])
    return jsonify({"ok": True})


@app.route("/api/events/<int:event_id>/log", methods=["POST"])
@login_required
def log_event_stats(event_id):
    event = db.get_event(event_id, session["user_id"])
    if not event:
        return jsonify({"error": "Event not found."}), 404

    sport = event["sport"]
    valid_keys = GAME_METRIC_KEYS_BY_SPORT.get(sport, [])
    payload = request.get_json(silent=True) or {}
    values = payload.get("values") or {}
    recorded_at = datetime.now().isoformat()

    saved = 0
    for metric_key, raw_value in values.items():
        if metric_key not in valid_keys or raw_value in (None, ""):
            continue
        metric = metric_lookup(sport, metric_key)
        if not metric:
            continue
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue
        db.add_stat_log(
            session["user_id"], sport, metric_key, metric["label"], metric["unit"], metric["direction"],
            value, recorded_at, 0,
        )
        saved += 1

    if saved == 0:
        return jsonify({"error": "Enter at least one stat value."}), 400

    db.mark_event_logged(event_id)
    return jsonify({"ok": True, "saved": saved})


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


# ---------- AI Coach ----------

@app.route("/api/coach/chat", methods=["POST"])
@login_required
def coach_chat():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    history = payload.get("history") or []

    if not message:
        return jsonify({"error": "Message is required."}), 400

    if genai is None:
        return jsonify({"error": "AI Coach isn't available on this deployment (google-generativeai isn't installed)."}), 503

    api_key = get_gemini_api_key()
    if not api_key:
        return jsonify({
            "error": (
                "AI Coach isn't set up yet. Get a free API key at aistudio.google.com, "
                "then either set it as the GEMINI_API_KEY environment variable or save it "
                f"as plain text to {gemini_key_path()}"
            )
        }), 503

    user_id = session["user_id"]
    with _coach_lock:
        now = time.time()
        if now - _coach_last_call.get(user_id, 0) < COACH_COOLDOWN_SECONDS:
            return jsonify({"error": "Slow down a bit before sending another message."}), 429
        _coach_last_call[user_id] = now

    context_summary = build_coach_context(db.get_stats_for_user(user_id))
    gemini_history = [
        {"role": "user" if h.get("role") == "user" else "model", "parts": [str(h.get("content") or "")]}
        for h in history[-20:]
        if h.get("content")
    ]

    try:
        system_prompt = db.get_setting("coach_system_prompt", DEFAULT_COACH_SYSTEM_PROMPT)
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            GEMINI_MODEL,
            system_instruction=system_prompt + "\n\n" + context_summary,
        )
        chat = model.start_chat(history=gemini_history)
        response = chat.send_message(message)
        reply = (response.text or "").strip()
    except Exception as exc:
        return jsonify({"error": f"Coach request failed: {exc}"}), 502

    if not reply:
        return jsonify({"error": "Coach didn't return a response — try rephrasing."}), 502

    return jsonify({"reply": reply})


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
    import webview  # desktop-only dependency, not installed/needed in the cloud deploy

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
