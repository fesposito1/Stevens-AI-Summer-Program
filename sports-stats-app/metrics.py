SPORT_METRICS = {
    "Bio": [
        {"key": "height_cm", "label": "Height", "unit": "cm", "direction": "higher"},
        {"key": "weight_kg", "label": "Weight", "unit": "kg", "direction": "higher"},
        {"key": "age", "label": "Age", "unit": "yrs", "direction": "higher"},
    ],
    "Running": [
        {"key": "mile_time_sec", "label": "Mile Time", "unit": "sec", "direction": "lower"},
        {"key": "sprint_100m_sec", "label": "100m Sprint", "unit": "sec", "direction": "lower"},
    ],
    "Basketball": [
        {"key": "vertical_jump_in", "label": "Vertical Jump", "unit": "in", "direction": "higher"},
        {"key": "free_throw_pct", "label": "Free Throw %", "unit": "%", "direction": "higher"},
        {"key": "three_pt_pct", "label": "Three-Point %", "unit": "%", "direction": "higher"},
    ],
    "Football": [
        {"key": "forty_yard_dash_sec", "label": "40-Yard Dash", "unit": "sec", "direction": "lower"},
        {"key": "bench_press_lbs", "label": "Bench Press Max", "unit": "lbs", "direction": "higher"},
    ],
    "Soccer": [
        {"key": "sprint_40m_sec", "label": "40m Sprint", "unit": "sec", "direction": "lower"},
        {"key": "juggles_count", "label": "Juggling Count", "unit": "reps", "direction": "higher"},
    ],
    "Baseball": [
        {"key": "batting_avg", "label": "Batting Average", "unit": "", "direction": "higher"},
        {"key": "pitch_velocity_mph", "label": "Pitch Velocity", "unit": "mph", "direction": "higher"},
    ],
    "Hockey": [
        {"key": "shot_speed_mph", "label": "Shot Speed", "unit": "mph", "direction": "higher"},
        {"key": "skating_sprint_sec", "label": "Sprint Skate (rink length)", "unit": "sec", "direction": "lower"},
    ],
    "Golf": [
        {"key": "avg_score", "label": "Average 18-Hole Score", "unit": "strokes", "direction": "lower"},
        {"key": "driving_distance_yds", "label": "Driving Distance", "unit": "yds", "direction": "higher"},
    ],
    "Tennis": [
        {"key": "serve_speed_mph", "label": "Serve Speed", "unit": "mph", "direction": "higher"},
    ],
    "MMA/Boxing": [
        {"key": "punch_power_lbs", "label": "Punch Power", "unit": "lbs", "direction": "higher"},
        {"key": "mile_time_sec", "label": "Mile Time (Conditioning)", "unit": "sec", "direction": "lower"},
    ],
    "General Fitness": [
        {"key": "pushups_max", "label": "Max Push-ups", "unit": "reps", "direction": "higher"},
        {"key": "pullups_max", "label": "Max Pull-ups", "unit": "reps", "direction": "higher"},
        {"key": "mile_time_sec", "label": "Mile Time", "unit": "sec", "direction": "lower"},
    ],
}


def metric_lookup(sport, metric_key):
    for metric in SPORT_METRICS.get(sport, []):
        if metric["key"] == metric_key:
            return metric
    return None
