from sqlalchemy import text
from db_config import get_engine
from energy_service import EnergyService


def run_system():
    print("Iniciando Análisis Vatto AI (Datos Reales)...")

    service = EnergyService()
    engine = get_engine()

    with engine.connect() as conn:
        devices = conn.execute(
            text(
                """
                SELECT d.id, d.name, d.device_type, l.user_id
                FROM devices d
                JOIN locations l ON d.location_id = l.id
                WHERE d.is_active = TRUE
                """
            )
        ).fetchall()

        for dev in devices:
            d_id, d_name, d_type, owner_user_id = dev

            reading = conn.execute(
                text(
                    """
                SELECT power_watts, time FROM readings 
                WHERE device_id = :did ORDER BY time DESC LIMIT 1
            """
                ),
                {"did": d_id},
            ).fetchone()

            if reading:
                watts = float(reading[0])
                r_time = reading[1]

                print(f"\n{d_name} ({d_type})")
                print(f"Dato: {watts}W | Hora lectura: {r_time.strftime('%H:%M')}")

                try:
                    result = service.analyze_device_reading(
                        user_id=owner_user_id,
                        device_id=d_id,
                        device_type=d_type,
                        current_watts=watts,
                        reading_timestamp=r_time,
                    )

                    if result["status"] == "NORMAL":
                        print("Funcionamiento Correcto")
                    elif result["status"] == "CRITICAL_CONSUMPTION":
                        print("⚠️  ALERTA: Consumo crítico detectado - Recomendación guardada")
                    else:
                        print(f"⚠️  Anomalía detectada (ID: {result['id']}) - Recomendación guardada")
                except Exception as e:
                    print(f"❌ ERROR: {type(e).__name__}: {str(e)}")
            else:
                print(f"{d_name}: Sin datos recientes.")


if __name__ == "__main__":
    run_system()
