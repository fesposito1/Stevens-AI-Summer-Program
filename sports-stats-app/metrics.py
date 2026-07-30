SPORT_METRICS = {
    "Bio": [
        {"key": "height_in", "label": "Height", "unit": "in", "direction": "higher"},
        {"key": "weight_lbs", "label": "Weight", "unit": "lbs", "direction": "higher"},
        {"key": "age", "label": "Age", "unit": "yrs", "direction": "higher"},
    ],
    "Running": [
        {"key": "mile_time_sec", "label": "Mile Time", "unit": "sec", "direction": "lower"},
        {"key": "sprint_100m_sec", "label": "100m Sprint", "unit": "sec", "direction": "lower"},
        {"key": "race_time_sec", "label": "Race Time", "unit": "sec", "direction": "lower"},
        {"key": "distance_miles", "label": "Distance Covered", "unit": "mi", "direction": "higher"},
    ],
    "Basketball": [
        {"key": "vertical_jump_in", "label": "Vertical Jump", "unit": "in", "direction": "higher"},
        {"key": "free_throw_pct", "label": "Free Throw %", "unit": "%", "direction": "higher"},
        {"key": "three_pt_pct", "label": "Three-Point %", "unit": "%", "direction": "higher"},
        {"key": "points", "label": "Points", "unit": "reps", "direction": "higher"},
        {"key": "rebounds", "label": "Rebounds", "unit": "reps", "direction": "higher"},
        {"key": "assists", "label": "Assists", "unit": "reps", "direction": "higher"},
        {"key": "steals", "label": "Steals", "unit": "reps", "direction": "higher"},
        {"key": "blocks", "label": "Blocks", "unit": "reps", "direction": "higher"},
        {"key": "turnovers", "label": "Turnovers", "unit": "reps", "direction": "lower"},
    ],
    "Football": [
        {"key": "forty_yard_dash_sec", "label": "40-Yard Dash", "unit": "sec", "direction": "lower"},
        {"key": "bench_press_lbs", "label": "Bench Press Max", "unit": "lbs", "direction": "higher"},
        {"key": "touchdowns", "label": "Touchdowns", "unit": "reps", "direction": "higher"},
        {"key": "total_yards", "label": "Total Yards", "unit": "yds", "direction": "higher"},
        {"key": "tackles", "label": "Tackles", "unit": "reps", "direction": "higher"},
        {"key": "sacks", "label": "Sacks", "unit": "reps", "direction": "higher"},
        {"key": "interceptions", "label": "Interceptions", "unit": "reps", "direction": "higher"},
    ],
    "Soccer": [
        {"key": "sprint_40m_sec", "label": "40m Sprint", "unit": "sec", "direction": "lower"},
        {"key": "juggles_count", "label": "Juggling Count", "unit": "reps", "direction": "higher"},
        {"key": "possession_completion_pct", "label": "Possession Completion", "unit": "%", "direction": "higher"},
        {"key": "pass_completion_pct", "label": "Pass Completion Rate", "unit": "%", "direction": "higher"},
        {"key": "tackles", "label": "Tackles", "unit": "reps", "direction": "higher"},
        {"key": "interceptions", "label": "Interceptions", "unit": "reps", "direction": "higher"},
        {"key": "goals", "label": "Goals", "unit": "reps", "direction": "higher"},
        {"key": "assists", "label": "Assists", "unit": "reps", "direction": "higher"},
        {"key": "shots_dominant_foot", "label": "Shots (Dominant Foot)", "unit": "reps", "direction": "higher"},
        {"key": "shots_non_dominant_foot", "label": "Shots (Non-Dominant Foot)", "unit": "reps", "direction": "higher"},
        {"key": "saves", "label": "Saves (Goalkeeper)", "unit": "reps", "direction": "higher"},
    ],
    "Baseball": [
        {"key": "batting_avg", "label": "Batting Average", "unit": "", "direction": "higher"},
        {"key": "pitch_velocity_mph", "label": "Pitch Velocity", "unit": "mph", "direction": "higher"},
        {"key": "hits", "label": "Hits", "unit": "reps", "direction": "higher"},
        {"key": "at_bats", "label": "At Bats", "unit": "reps", "direction": "higher"},
        {"key": "runs", "label": "Runs", "unit": "reps", "direction": "higher"},
        {"key": "rbis", "label": "RBIs", "unit": "reps", "direction": "higher"},
        {"key": "stolen_bases", "label": "Stolen Bases", "unit": "reps", "direction": "higher"},
        {"key": "strikeouts", "label": "Strikeouts", "unit": "reps", "direction": "lower"},
    ],
    "Hockey": [
        {"key": "shot_speed_mph", "label": "Shot Speed", "unit": "mph", "direction": "higher"},
        {"key": "skating_sprint_sec", "label": "Sprint Skate (rink length)", "unit": "sec", "direction": "lower"},
        {"key": "goals", "label": "Goals", "unit": "reps", "direction": "higher"},
        {"key": "assists", "label": "Assists", "unit": "reps", "direction": "higher"},
        {"key": "shots_on_goal", "label": "Shots on Goal", "unit": "reps", "direction": "higher"},
        {"key": "penalty_minutes", "label": "Penalty Minutes", "unit": "min", "direction": "lower"},
        {"key": "saves", "label": "Saves (Goalie)", "unit": "reps", "direction": "higher"},
    ],
    "Golf": [
        {"key": "avg_score", "label": "Average 18-Hole Score", "unit": "strokes", "direction": "lower"},
        {"key": "driving_distance_yds", "label": "Driving Distance", "unit": "yds", "direction": "higher"},
        {"key": "round_score", "label": "Round Score", "unit": "strokes", "direction": "lower"},
        {"key": "putts", "label": "Putts", "unit": "reps", "direction": "lower"},
        {"key": "fairways_hit_pct", "label": "Fairways Hit %", "unit": "%", "direction": "higher"},
        {"key": "greens_in_regulation_pct", "label": "Greens in Regulation %", "unit": "%", "direction": "higher"},
    ],
    "Tennis": [
        {"key": "serve_speed_mph", "label": "Serve Speed", "unit": "mph", "direction": "higher"},
        {"key": "aces", "label": "Aces", "unit": "reps", "direction": "higher"},
        {"key": "double_faults", "label": "Double Faults", "unit": "reps", "direction": "lower"},
        {"key": "winners", "label": "Winners", "unit": "reps", "direction": "higher"},
        {"key": "unforced_errors", "label": "Unforced Errors", "unit": "reps", "direction": "lower"},
    ],
    "MMA/Boxing": [
        {"key": "punch_power_lbs", "label": "Punch Power", "unit": "lbs", "direction": "higher"},
        {"key": "mile_time_sec", "label": "Mile Time (Conditioning)", "unit": "sec", "direction": "lower"},
        {"key": "punches_landed", "label": "Punches Landed", "unit": "reps", "direction": "higher"},
        {"key": "takedowns", "label": "Takedowns", "unit": "reps", "direction": "higher"},
        {"key": "knockdowns", "label": "Knockdowns", "unit": "reps", "direction": "higher"},
    ],
    "General Fitness": [
        {"key": "pushups_max", "label": "Max Push-ups", "unit": "reps", "direction": "higher"},
        {"key": "pullups_max", "label": "Max Pull-ups", "unit": "reps", "direction": "higher"},
        {"key": "mile_time_sec", "label": "Mile Time", "unit": "sec", "direction": "lower"},
    ],
}


GAME_METRIC_KEYS_BY_SPORT = {
    "Soccer": [
        "possession_completion_pct",
        "pass_completion_pct",
        "tackles",
        "interceptions",
        "goals",
        "assists",
        "shots_dominant_foot",
        "shots_non_dominant_foot",
        "saves",
    ],
    "Basketball": ["points", "rebounds", "assists", "steals", "blocks", "turnovers"],
    "Football": ["touchdowns", "total_yards", "tackles", "sacks", "interceptions"],
    "Baseball": ["hits", "at_bats", "runs", "rbis", "stolen_bases", "strikeouts"],
    "Hockey": ["goals", "assists", "shots_on_goal", "penalty_minutes", "saves"],
    "Golf": ["round_score", "putts", "fairways_hit_pct", "greens_in_regulation_pct"],
    "Tennis": ["aces", "double_faults", "winners", "unforced_errors"],
    "MMA/Boxing": ["punches_landed", "takedowns", "knockdowns"],
    "Running": ["race_time_sec", "distance_miles"],
}


def metric_lookup(sport, metric_key):
    for metric in SPORT_METRICS.get(sport, []):
        if metric["key"] == metric_key:
            return metric
    return None


def game_metrics_for_sport(sport):
    keys = GAME_METRIC_KEYS_BY_SPORT.get(sport, [])
    return [m for m in SPORT_METRICS.get(sport, []) if m["key"] in keys]
