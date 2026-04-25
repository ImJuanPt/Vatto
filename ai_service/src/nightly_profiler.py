import pandas as pd
import json
import numpy as np
from sqlalchemy import create_engine, text
from db_config import get_engine

engine = get_engine()


def run_nightly_analysis():
    print("Iniciando perfilamiento nocturno de equipos...")

    with engine.connect() as conn:
        devices = conn.execute(
            text("SELECT id FROM devices WHERE is_active = TRUE")
        ).fetchall()

        for dev in devices:
            device_id = dev[0]
            process_device_profile(device_id)


def process_device_profile(device_id):
    query = f"""
        SELECT power_watts, time 
        FROM readings 
        WHERE device_id = {device_id} 
        AND time > NOW() - INTERVAL '30 days'
    """
    df = pd.read_sql(query, engine)

    if df.empty:
        print(f"Device {device_id}: Sin datos para perfilar.")
        return

    active_usage = df[df["power_watts"] > 5]["power_watts"]

    if active_usage.empty:
        avg_watts = 0
        std_dev = 0
    else:
        avg_watts = float(active_usage.mean())
        std_dev = float(active_usage.std())

    max_watts = float(df["power_watts"].max())

    upper_bound = avg_watts + (3 * std_dev)
    lower_bound = max(0, avg_watts - (3 * std_dev))

    learned_pattern = {
        "avg_watts": round(avg_watts, 2),
        "std_dev": round(std_dev, 2),
        "max_historical": round(max_watts, 2),
        "samples_analyzed": len(df),
        "last_analysis": str(pd.Timestamp.now()),
    }

    save_profile(device_id, learned_pattern, upper_bound, lower_bound)


def save_profile(device_id, pattern_json, upper, lower):
    with engine.connect() as conn:
        sql = text(
            """
            INSERT INTO device_behavior_profiles 
            (device_id, learned_pattern, predicted_upper_bound, predicted_lower_bound, confidence_score, updated_at)
            VALUES (:did, :json, :up, :low, 0.95, NOW())
            ON CONFLICT (device_id) DO UPDATE SET
                learned_pattern = :json,
                predicted_upper_bound = :up,
                predicted_lower_bound = :low,
                updated_at = NOW();
        """
        )

        conn.execute(
            sql,
            {
                "did": device_id,
                "json": json.dumps(pattern_json),
                "up": round(upper, 2),
                "low": round(lower, 2),
            },
        )
        conn.commit()

    print(
        f"Device {device_id}: Perfil actualizado. (Avg: {pattern_json['avg_watts']}W | Max Limit: {round(upper, 2)}W)"
    )


if __name__ == "__main__":
    run_nightly_analysis()
