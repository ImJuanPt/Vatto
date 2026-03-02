import pandas as pd
import numpy as np
import random
import os

OUTPUT_FILE = "../data/training_data.csv"
SAMPLES = 25000

DEVICE_MAP = {
    "Refrigerador": 150,
    "Mini Refrigerador": 80,
    "Aire Acondicionado": 1200,
    "Calefactor": 1500,
    "Lavadora": 500,
    "Secadora": 2500,
    "Televisor": 120,
    "Computadora": 300,
    "Laptop": 65,
    "Microondas": 1000,
    "Horno": 2200,
    "Luces": 60,
    "Router": 12,
}


def generate_dataset():
    print("Generando Dataset Vatto 4.0 (Tendencia Cero)...")
    data = []
    device_list = list(DEVICE_MAP.keys())

    for _ in range(SAMPLES):
        dev_type = random.choice(device_list)
        base_watts = DEVICE_MAP[dev_type]
        hour = random.randint(0, 23)

        current_watts = base_watts
        avg_watts = base_watts
        rolling_avg = base_watts
        volatility = base_watts * 0.02
        trend = 0.0
        label_id = 0

        dice = random.random()

        if dice > 0.4:
            current_watts = base_watts * random.uniform(0.9, 1.1)
            rolling_avg = current_watts
            trend = random.uniform(-5, 5)

            if dev_type == "Computadora" and dice > 0.8:
                current_watts = random.uniform(40, 90)
                rolling_avg = current_watts

            if dev_type in ["Televisor", "Computadora"] and (1 <= hour <= 6):
                current_watts = 3.0
                rolling_avg = 3.0

            label_id = 0

        else:
            if dev_type == "Aire Acondicionado":
                if dice < 0.1:
                    current_watts = base_watts * 1.5
                    trend = 40.0
                    label_id = 3
                else:
                    current_watts = base_watts * random.uniform(1.3, 1.8)
                    rolling_avg = current_watts
                    trend = random.uniform(-2, 2)
                    label_id = 4

            elif dev_type == "Computadora":
                if dice < 0.15:
                    current_watts = base_watts * 1.2
                    volatility = 0.1
                    label_id = 7
                elif 1 <= hour <= 6:
                    current_watts = base_watts
                    label_id = 17

            elif dev_type == "Refrigerador":
                current_watts = base_watts * 1.6
                label_id = 1

            elif dice < 0.05:
                current_watts = base_watts * 5.0
                label_id = 18

        data.append(
            {
                "device_type": dev_type,
                "hour": hour,
                "current_watts": round(current_watts, 2),
                "avg_watts": round(avg_watts, 2),
                "rolling_avg": round(rolling_avg, 2),
                "volatility": round(volatility, 2),
                "trend": round(trend, 2),
                "label": label_id,
            }
        )

    os.makedirs("../data", exist_ok=True)
    df = pd.DataFrame(data)
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"Datos regenerados (Incluye fallas estáticas).")


if __name__ == "__main__":
    generate_dataset()
