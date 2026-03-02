import pickle
import pandas as pd
import os


DEVICE_TYPE_ALIASES = {
    # canonical de entrenamiento
    "refrigerador": "Refrigerador",
    "mini refrigerador": "Mini Refrigerador",
    "aire acondicionado": "Aire Acondicionado",
    "calefactor": "Calefactor",
    "lavadora": "Lavadora",
    "secadora": "Secadora",
    "televisor": "Televisor",
    "computadora": "Computadora",
    "laptop": "Laptop",
    "microondas": "Microondas",
    "horno": "Horno",
    "luces": "Luces",
    "router": "Router",
    # aliases backend en inglés/snake_case
    "refrigerator": "Refrigerador",
    "fridge": "Refrigerador",
    "mini_fridge": "Mini Refrigerador",
    "aircon": "Aire Acondicionado",
    "ac": "Aire Acondicionado",
    "heater": "Calefactor",
    "washing_machine": "Lavadora",
    "washer": "Lavadora",
    "dryer": "Secadora",
    "tv": "Televisor",
    "computer": "Computadora",
    "pc": "Computadora",
    "notebook": "Laptop",
    "microwave": "Microondas",
    "oven": "Horno",
    "lights": "Luces",
    # aproximaciones para tipos fuera de entrenamiento
    "coffee_maker": "Microondas",
    "fan": "Aire Acondicionado",
}


class VattoBrainEngine:
    def __init__(self, model_path="../models/vatto_brain_v2.pkl"):
        self.ready = False
        try:
            base = os.path.dirname(os.path.abspath(__file__))
            path = os.path.join(base, model_path)
            with open(path, "rb") as f:
                data = pickle.load(f)
                self.model = data["model"]
                self.encoder = data["encoder"]
                self.label_encoder = data.get(
                    "label_encoder"
                ) 
                self.ready = True
        except Exception as e:
            print(f"Error cargando modelo: {e}")

    def predict_status(
        self,
        device_type,
        current_watts,
        avg_watts,
        hour,
        rolling_avg,
        volatility,
        trend,
    ):
        if not self.ready:
            return 0

        normalized_device_type = self._normalize_device_type(device_type)

        try:
            d_code = self.encoder.transform([normalized_device_type])[0]
        except:
            d_code = 0

        input_data = pd.DataFrame(
            [[d_code, hour, current_watts, avg_watts, rolling_avg, volatility, trend]],
            columns=[
                "dev_code",
                "hour",
                "current_watts",
                "avg_watts",
                "rolling_avg",
                "volatility",
                "trend",
            ],
        )

        prediction_encoded = self.model.predict(input_data)[0]

        if self.label_encoder:
            prediction_sql_id = self.label_encoder.inverse_transform(
                [prediction_encoded]
            )[0]
        else:
            prediction_sql_id = prediction_encoded

        return int(prediction_sql_id)

    def _normalize_device_type(self, raw_type):
        if raw_type is None:
            return "Computadora"
        key = str(raw_type).strip().lower().replace("-", "_")
        return DEVICE_TYPE_ALIASES.get(key, str(raw_type))
