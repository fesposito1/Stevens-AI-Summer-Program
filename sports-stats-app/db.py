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
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_hash TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin INTEGER DEFAULT 0")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_device_id TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium INTEGER DEFAULT 0")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_since TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_messages_date TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_messages_count INTEGER DEFAULT 0")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    event_date TEXT NOT NULL,
                    event_time TEXT,
                    event_type TEXT NOT NULL,
                    sport TEXT NOT NULL DEFAULT 'Soccer',
                    opponent TEXT,
                    notes TEXT,
                    logged INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TEXT")
            conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'Soccer'")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS followed_players (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    player_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    sport TEXT,
                    team TEXT,
                    thumb TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE (user_id, player_id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS banned_ips (
                    ip_address TEXT PRIMARY KEY,
                    banned_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS banned_devices (
                    device_id TEXT PRIMARY KEY,
                    banned_at TEXT NOT NULL
                )
            """)
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
            conn.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    event_date TEXT NOT NULL,
                    event_time TEXT,
                    event_type TEXT NOT NULL,
                    sport TEXT NOT NULL DEFAULT 'Soccer',
                    opponent TEXT,
                    notes TEXT,
                    logged INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS followed_players (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    player_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    sport TEXT,
                    team TEXT,
                    thumb TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE (user_id, player_id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS banned_ips (
                    ip_address TEXT PRIMARY KEY,
                    banned_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS banned_devices (
                    device_id TEXT PRIMARY KEY,
                    banned_at TEXT NOT NULL
                )
            """)
            # Migrations for databases created before these columns existed.
            for stmt in (
                "ALTER TABLE stat_logs ADD COLUMN rest_days REAL DEFAULT 0",
                "ALTER TABLE users ADD COLUMN security_question TEXT",
                "ALTER TABLE users ADD COLUMN security_answer_hash TEXT",
                "ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0",
                "ALTER TABLE users ADD COLUMN last_login TEXT",
                "ALTER TABLE users ADD COLUMN last_ip TEXT",
                "ALTER TABLE users ADD COLUMN last_device_id TEXT",
                "ALTER TABLE users ADD COLUMN is_premium INTEGER DEFAULT 0",
                "ALTER TABLE users ADD COLUMN premium_since TEXT",
                "ALTER TABLE users ADD COLUMN coach_messages_date TEXT",
                "ALTER TABLE users ADD COLUMN coach_messages_count INTEGER DEFAULT 0",
                "ALTER TABLE users ADD COLUMN stripe_customer_id TEXT",
                "ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT",
                "ALTER TABLE events ADD COLUMN event_time TEXT",
                "ALTER TABLE events ADD COLUMN sport TEXT NOT NULL DEFAULT 'Soccer'",
            ):
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError:
                    pass


def create_user(username, password_hash, created_at, security_question=None,
                security_answer_hash=None, is_admin=0):
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO users (username, password_hash, created_at, security_question,
                                   security_answer_hash, is_admin)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (username, password_hash, created_at, security_question, security_answer_hash, is_admin),
        )
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        return row["id"]


def get_user_by_username(username):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def get_all_users():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, username, created_at, is_admin, last_login, last_ip, last_device_id, is_premium "
            "FROM users ORDER BY username"
        ).fetchall()
        return [dict(r) for r in rows]


def update_user_password(user_id, password_hash):
    with get_conn() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))


def update_security_question(user_id, security_question, security_answer_hash):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET security_question = ?, security_answer_hash = ? WHERE id = ?",
            (security_question, security_answer_hash, user_id),
        )


def rename_user(user_id, new_username):
    with get_conn() as conn:
        conn.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, user_id))


def update_last_login(user_id, timestamp, ip_address=None, device_id=None):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET last_login = ?, last_ip = ?, last_device_id = ? WHERE id = ?",
            (timestamp, ip_address, device_id, user_id),
        )


def delete_user(user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM stat_logs WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM events WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM followed_players WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def set_premium(user_id, is_premium, since=None):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET is_premium = ?, premium_since = ? WHERE id = ?",
            (1 if is_premium else 0, since, user_id),
        )


def set_stripe_ids(user_id, customer_id, subscription_id):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?",
            (customer_id, subscription_id, user_id),
        )


def get_user_by_stripe_subscription(subscription_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE stripe_subscription_id = ?", (subscription_id,)
        ).fetchone()
        return dict(row) if row else None


def get_coach_usage(user_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT coach_messages_date, coach_messages_count FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return (row["coach_messages_date"], row["coach_messages_count"] or 0) if row else (None, 0)


def set_coach_usage(user_id, date, count):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET coach_messages_date = ?, coach_messages_count = ? WHERE id = ?",
            (date, count, user_id),
        )


def ban_ip(ip_address, banned_at):
    with get_conn() as conn:
        if USE_POSTGRES:
            conn.execute(
                """INSERT INTO banned_ips (ip_address, banned_at) VALUES (?, ?)
                   ON CONFLICT (ip_address) DO NOTHING""",
                (ip_address, banned_at),
            )
        else:
            conn.execute(
                "INSERT OR IGNORE INTO banned_ips (ip_address, banned_at) VALUES (?, ?)",
                (ip_address, banned_at),
            )


def unban_ip(ip_address):
    with get_conn() as conn:
        conn.execute("DELETE FROM banned_ips WHERE ip_address = ?", (ip_address,))


def is_ip_banned(ip_address):
    with get_conn() as conn:
        row = conn.execute("SELECT 1 FROM banned_ips WHERE ip_address = ?", (ip_address,)).fetchone()
        return row is not None


def get_banned_ips():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM banned_ips ORDER BY banned_at DESC").fetchall()
        return [dict(r) for r in rows]


def ban_device(device_id, banned_at):
    with get_conn() as conn:
        if USE_POSTGRES:
            conn.execute(
                """INSERT INTO banned_devices (device_id, banned_at) VALUES (?, ?)
                   ON CONFLICT (device_id) DO NOTHING""",
                (device_id, banned_at),
            )
        else:
            conn.execute(
                "INSERT OR IGNORE INTO banned_devices (device_id, banned_at) VALUES (?, ?)",
                (device_id, banned_at),
            )


def unban_device(device_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM banned_devices WHERE device_id = ?", (device_id,))


def is_device_banned(device_id):
    with get_conn() as conn:
        row = conn.execute("SELECT 1 FROM banned_devices WHERE device_id = ?", (device_id,)).fetchone()
        return row is not None


def get_banned_devices():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM banned_devices ORDER BY banned_at DESC").fetchall()
        return [dict(r) for r in rows]


def get_setting(key, default=None):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key, value):
    with get_conn() as conn:
        if USE_POSTGRES:
            conn.execute(
                """INSERT INTO app_settings (key, value) VALUES (?, ?)
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""",
                (key, value),
            )
        else:
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )


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


def add_event(user_id, event_date, event_type, sport, opponent, notes, created_at, event_time=None):
    with get_conn() as conn:
        if USE_POSTGRES:
            row = conn.execute(
                """INSERT INTO events (user_id, event_date, event_time, event_type, sport, opponent, notes, logged, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?) RETURNING id""",
                (user_id, event_date, event_time, event_type, sport, opponent, notes, created_at),
            ).fetchone()
            return row["id"]
        cur = conn.execute(
            """INSERT INTO events (user_id, event_date, event_time, event_type, sport, opponent, notes, logged, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)""",
            (user_id, event_date, event_time, event_type, sport, opponent, notes, created_at),
        )
        return cur.lastrowid


def get_events_for_user(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE user_id = ? ORDER BY event_date ASC, event_time ASC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_events_on_date(user_id, event_date):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE user_id = ? AND event_date = ? ORDER BY event_time ASC, id ASC",
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


def follow_player(user_id, player_id, name, sport, team, thumb, created_at):
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO followed_players (user_id, player_id, name, sport, team, thumb, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (user_id, player_id) DO NOTHING""",
            (user_id, player_id, name, sport, team, thumb, created_at),
        )


def unfollow_player(user_id, player_id):
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM followed_players WHERE user_id = ? AND player_id = ?",
            (user_id, player_id),
        )


def get_followed_players(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM followed_players WHERE user_id = ? ORDER BY created_at DESC",
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
            SELECT sl.user_id, u.username, u.is_premium, sl.value, sl.unit, sl.direction, sl.recorded_at
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
