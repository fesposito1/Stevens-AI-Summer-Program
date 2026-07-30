from contextlib import contextmanager
import os
import sqlite3


def data_dir():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "SportsStatsApp")
    os.makedirs(path, exist_ok=True)
    return path


DB_PATH = os.path.join(data_dir(), "data.db")


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                event_date TEXT NOT NULL,
                event_type TEXT NOT NULL,
                opponent TEXT,
                notes TEXT,
                logged INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)


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


def add_event(user_id, event_date, event_type, opponent, notes, created_at):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO events (user_id, event_date, event_type, opponent, notes, logged, created_at)
               VALUES (?, ?, ?, ?, ?, 0, ?)""",
            (user_id, event_date, event_type, opponent, notes, created_at),
        )
        return cur.lastrowid


def get_events_for_user(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE user_id = ? ORDER BY event_date ASC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_events_on_date(user_id, event_date):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE user_id = ? AND event_date = ? ORDER BY id ASC",
            (user_id, event_date),
        ).fetchall()
        return [dict(r) for r in rows]


def get_event(event_id, user_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM events WHERE id = ? AND user_id = ?", (event_id, user_id)
        ).fetchone()
        return dict(row) if row else None


def mark_event_logged(event_id):
    with get_conn() as conn:
        conn.execute("UPDATE events SET logged = 1 WHERE id = ?", (event_id,))


def delete_event(event_id, user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM events WHERE id = ? AND user_id = ?", (event_id, user_id))


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
