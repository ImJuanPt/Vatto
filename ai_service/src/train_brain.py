import pandas as pd
import pickle
import os
from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# Rutas absolutas basadas en la ubicación del script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # ai_service/
DATA_PATH = os.path.join(BASE_DIR, "data", "training_data.csv")
MODEL_PATH = os.path.join(BASE_DIR, "models", "vatto_brain_v2.pkl")


def train_xgboost():
    if not os.path.exists(DATA_PATH):
        print("Ejecuta data_generator.py primero.")
        return

    print("Entrenando Vatto AI 2.0 (Solucionando saltos de XGBoost)...")
    df = pd.read_csv(DATA_PATH)

    le_dev = LabelEncoder()
    df["dev_code"] = le_dev.fit_transform(df["device_type"])

    le_label = LabelEncoder()
    y_encoded = le_label.fit_transform(df["label"])

    features = [
        "dev_code",
        "hour",
        "current_watts",
        "avg_watts",
        "rolling_avg",
        "volatility",
        "trend",
    ]
    X = df[features]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded, test_size=0.2, random_state=42
    )

    model = XGBClassifier(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=7,
        objective="multi:softmax",
        eval_metric="mlogloss",
        use_label_encoder=False,
    )

    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    print(f"Precisión: {accuracy_score(y_test, preds):.2%}")

    artifact = {"model": model, "encoder": le_dev, "label_encoder": le_label}
    
    # Asegurar que la carpeta exists
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(artifact, f)
    print(f"Cerebro guardado en {MODEL_PATH}")


if __name__ == "__main__":
    train_xgboost()
