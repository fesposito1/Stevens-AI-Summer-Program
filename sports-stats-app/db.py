from contextlib import contextmanager
import os
import sqlite3

DATABASE_URL = os.environ.get("DATABASE_URL")
USE_POSTGRES = bool(DATABASE_URL)

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras


def data_dir():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "SportsStatsApp")
    os.makedirs(path, exist_ok=True)
    return path


DB_PATH = None if USE_POSTGRES else os.path.join(data_dir(), "data.db")


def _adapt(query):
    """SQLite uses '?' placeholders, psycopg2 uses '%s' - translate when on Postgres."""
    return query.replace("?", "%s") if USE_POSTGRES else query


class _PGConnWrapper:
    """Gives a psycopg2 connection the same conn.execute(...).fetchone()/fetchall()
    convenience API that sqlite3.Connection provides, so the rest of this module
    doesn't need to know which backend it's talking to."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, query, params=()):
        cur = self._conn.cursor()
        cur.execute(_adapt(query), params)
        return cur

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


@contextmanager
def get_conn():
    if USE_POSTGRES:
        raw = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        conn = _PGConnWrapper(raw)
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        if USE_POSTGRES:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS stat_logs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    sport TEXT NOT NULL,
                    metric_key TEXT NOT NULL,
                    label TEXT NOT NULL,
                    unit TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    value REAL NOT NULL,
                    recorded_at TEXT NOT NULL,
                    rest_days REAL DEFAULT 0
                )
            """)
            conn.execute("ALTER TABLE stat_logs ADD COLUMN IF NOT EXISTS rest_days REAL DEFAULT 0")
        else:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS stat_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    sport TEXT NOT NULL,
                    metric_key TEXT NOT NULL,
                    label TEXT NOT NULL,
                    unit TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    value REAL NOT NULL,
                    recorded_at TEXT NOT NULL,
                    rest_days REAL DEFAULT 0
                )
            """)
            # Migration for databases created before rest_days existed.
            try:
                conn.execute("ALTER TABLE stat_logs ADD COLUMN rest_days REAL DEFAULT 0")
            except sqlite3.OperationalError:
                pass


def create_user(username, password_hash, created_at):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, password_hash, created_at),
        )
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        return row["id"]


def get_user_by_username(username):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None


def add_stat_log(user_id, sport, metric_key, label, unit, direction, value, recorded_at, rest_days=0):
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO stat_logs (user_id, sport, metric_key, label, unit, direction, value, recorded_at, rest_days)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, sport, metric_key, label, unit, direction, value, recorded_at, rest_days),
        )


def get_stats_for_user(user_id, metric_key=None):
    with get_conn() as conn:
        if metric_key:
            rows = conn.execute(
                "SELECT * FROM stat_logs WHERE user_id = ? AND metric_key = ? ORDER BY recorded_at ASC",
                (user_id, metric_key),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM stat_logs WHERE user_id = ? ORDER BY recorded_at DESC",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]


def get_leaderboard_options():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT sport, metric_key, label, unit, direction FROM stat_logs ORDER BY sport, label"
        ).fetchall()
        return [dict(r) for r in rows]


def get_leaderboard(sport, metric_key):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT sl.user_id, u.username, sl.value, sl.unit, sl.direction, sl.recorded_at
            FROM stat_logs sl
            JOIN users u ON u.id = sl.user_id
            JOIN (
                SELECT user_id, MAX(recorded_at) AS max_recorded
                FROM stat_logs
                WHERE sport = ? AND metric_key = ?
                GROUP BY user_id
            ) latest ON latest.user_id = sl.user_id AND latest.max_recorded = sl.recorded_at
            WHERE sl.sport = ? AND sl.metric_key = ?
            """,
            (sport, metric_key, sport, metric_key),
        ).fetchall()

    entries = [dict(r) for r in rows]
    if not entries:
        return []
    reverse = entries[0]["direction"] == "higher"
    entries.sort(key=lambda e: e["value"], reverse=reverse)
    for i, entry in enumerate(entries, start=1):
        entry["rank"] = i
    return entries
