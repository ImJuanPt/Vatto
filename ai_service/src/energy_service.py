import datetime
import numpy as np
from sqlalchemy import text
from db_config import get_engine
from inference_engine import VattoBrainEngine


DEVICE_ALIAS = {
    "refrigerator": "refrigerator",
    "fridge": "refrigerator",
    "mini_fridge": "refrigerator",
    "aircon": "climate",
    "ac": "climate",
    "fan": "climate",
    "heater": "climate",
    "tv": "electronics",
    "computer": "electronics",
    "pc": "electronics",
    "laptop": "electronics",
    "router": "electronics",
    "washing_machine": "laundry",
    "washer": "laundry",
    "dryer": "laundry",
    "coffee_maker": "kitchen_small",
    "microwave": "kitchen_small",
    "oven": "kitchen_large",
}

# IDs válidos por familia de dispositivos (según recommendation_templates)
COMPATIBLE_TEMPLATE_IDS = {
    "refrigerator": {1, 2, 18},
    "climate": {3, 4, 18},
    "electronics": {5, 6, 7, 15, 17, 18},
    "laundry": {8, 9, 18},
    "kitchen_small": {10, 12, 18},
    "kitchen_large": {11, 18},
    "generic": {5, 17, 18},
}

FALLBACK_TEMPLATE_BY_FAMILY = {
    "refrigerator": 1,
    "climate": 4,
    "electronics": 5,
    "laundry": 8,
    "kitchen_small": 10,
    "kitchen_large": 11,
    "generic": 18,
}


class EnergyService:
    def __init__(self):
        self.engine = get_engine()
        self.brain = VattoBrainEngine()
        
        # Umbrales realistas de consumo (en Watts) para detectar anomalías
        self.consumption_thresholds = {
            "aircon": 2000,           # AC: >2000W = muy alto
            "ac": 2000,
            "fan": 150,               # Ventilador: >150W = muy alto
            "tv": 600,                # TV: >600W = muy alto
            "television": 600,
            "refrigerator": 550,      # Nevera: >550W = muy alto (consumo normal ~150-200W)
            "fridge": 550,
            "washing_machine": 2500,  # Lavadora: >2500W = muy alto o fallo
            "washer": 2500,
            "coffee_maker": 1200,     # Cafetera: >1200W = sobrecarga
            "microwave": 1400,        # Microondas: >1400W = sobrecarga
            "oven": 3500,             # Horno: >3500W = muy alto
        }

    def analyze_device_reading(
        self, user_id, device_id, device_type, current_watts, reading_timestamp
    ):

        # Primero verificar umbrales realistas (protección rápida)
        threshold = self.consumption_thresholds.get(device_type.lower(), current_watts * 1.5)
        if current_watts > threshold:
            # Consumo crítico detectado
            self._save_alert(
                user_id=user_id,
                device_id=device_id,
                device_type=device_type,
                rec_id=18,  # Alerta crítica
                current_watts=current_watts,
                avg_watts=threshold,
            )
            return {"status": "CRITICAL_CONSUMPTION", "id": 18}

        avg_watts_profile = self._get_profile_stats(device_id, current_watts)

        short_term_stats = self._get_short_term_memory(device_id, current_watts)

        if isinstance(reading_timestamp, str):
            hour = datetime.datetime.fromisoformat(str(reading_timestamp)).hour
        else:
            hour = reading_timestamp.hour

        prediction_id = self.brain.predict_status(
            device_type=device_type,
            current_watts=current_watts,
            avg_watts=avg_watts_profile,
            hour=hour,
            rolling_avg=short_term_stats["rolling"],
            volatility=short_term_stats["volatility"],
            trend=short_term_stats["trend"],
        )

        if prediction_id == 0:
            return {"status": "NORMAL", "id": 0}
        else:
            self._save_alert(
                user_id=user_id,
                device_id=device_id,
                device_type=device_type,
                rec_id=prediction_id,
                current_watts=current_watts,
                avg_watts=avg_watts_profile,
            )
            return {"status": "ANOMALY", "id": prediction_id}

    def _get_short_term_memory(self, device_id, current_val):
        """
        Calcula qué ha pasado en la última hora.
        """
        with self.engine.connect() as conn:
            query = text(
                """
                SELECT power_watts FROM readings 
                WHERE device_id = :did 
                ORDER BY time DESC LIMIT 12
            """
            )
            rows = conn.execute(query, {"did": device_id}).fetchall()

            values = [r[0] for r in rows]

            values.insert(0, current_val)

            arr = np.array(values, dtype=float)

            return {
                "rolling": float(np.mean(arr)),
                "volatility": float(np.std(arr)),
                "trend": (float(arr[0] - arr[-1]) if len(arr) > 1 else 0.0),
            }

    def _get_profile_stats(self, device_id, fallback):
        with self.engine.connect() as conn:
            query = text(
                "SELECT learned_pattern FROM device_behavior_profiles WHERE device_id = :did"
            )
            res = conn.execute(query, {"did": device_id}).fetchone()
            if res and res[0]:
                return float(res[0].get("avg_watts", fallback))
            return fallback

    def _normalize_family(self, device_type):
        key = str(device_type or "").strip().lower().replace("-", "_")
        return DEVICE_ALIAS.get(key, "generic")

    def _resolve_template_id(self, device_type, predicted_id, current_watts, avg_watts):
        family = self._normalize_family(device_type)
        allowed = COMPATIBLE_TEMPLATE_IDS.get(family, COMPATIBLE_TEMPLATE_IDS["generic"])

        if predicted_id in allowed:
            return predicted_id

        if avg_watts and avg_watts > 0 and (current_watts / avg_watts) >= 3.0:
            return 18

        return FALLBACK_TEMPLATE_BY_FAMILY.get(family, FALLBACK_TEMPLATE_BY_FAMILY["generic"])

    def _save_alert(self, user_id, device_id, device_type, rec_id, current_watts, avg_watts):
        final_rec_id = self._resolve_template_id(
            device_type=device_type,
            predicted_id=rec_id,
            current_watts=current_watts,
            avg_watts=avg_watts,
        )

        with self.engine.begin() as conn:  # .begin() auto-commits al salir del bloque
            tmpl = conn.execute(
                text("SELECT * FROM recommendation_templates WHERE id = :id"),
                {"id": final_rec_id},
            ).fetchone()
            if tmpl:
                print(f"📌 Guardando recomendación: {tmpl.title}")
                savings = float(tmpl.base_savings_kwh or 0) * 5.0

                # Evitar acumulación: si ya existe una recomendación activa
                # del mismo título para este dispositivo, se actualiza en vez de insertar.
                existing = conn.execute(
                    text(
                        """
                        SELECT id
                        FROM recommendations
                        WHERE device_id = :did
                          AND title = :tit
                          AND action_taken = FALSE
                        ORDER BY created_at DESC
                        LIMIT 1
                        """
                    ),
                    {
                        "did": device_id,
                        "tit": tmpl.title,
                    },
                ).fetchone()

                if existing:
                    conn.execute(
                        text(
                            """
                            UPDATE recommendations
                            SET user_id = :uid,
                                description = :desc,
                                severity_level = :sev,
                                ai_model_version = 'Vatto-XGB-v2',
                                potential_savings_kwh = :sav,
                                created_at = NOW()
                            WHERE id = :rid
                            """
                        ),
                        {
                            "uid": user_id,
                            "desc": tmpl.description,
                            "sev": tmpl.severity_level,
                            "sav": savings,
                            "rid": existing.id,
                        },
                    )
                    conn.commit()
                    return

                conn.execute(
                    text(
                        """
                    INSERT INTO recommendations (
                        user_id, device_id, title, description, 
                        severity_level, created_at, ai_model_version, 
                        potential_savings_kwh, action_taken, user_feedback_score
                    ) VALUES (:uid, :did, :tit, :desc, :sev, NOW(), 'Vatto-XGB-v2', :sav, FALSE, 0)
                """
                    ),
                    {
                        "uid": user_id,
                        "did": device_id,
                        "tit": tmpl.title,
                        "desc": tmpl.description,
                        "sev": tmpl.severity_level,
                        "sav": savings,
                    },
                )
                conn.commit()
