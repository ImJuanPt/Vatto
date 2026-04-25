-- =========================================================
-- VATTO - Seed masivo de readings (histórico + escenario IA)
-- Fecha de referencia: 2026-03-02
-- Objetivo:
--   1) Limpiar readings
--   2) Cargar varios meses de datos realistas
--   3) Forzar 3 equipos en alerta (aircon, refrigerator, tv)
--   4) Mantener otros equipos en estado normal
-- =========================================================

BEGIN;

-- 1) Limpiar todas las lecturas
DELETE FROM readings;

-- 2) Base histórica (2025-10-01 -> 2026-03-01), cada 12h
WITH active_devices AS (
  SELECT id, device_type
  FROM devices
  WHERE is_active = TRUE
), series AS (
  SELECT generate_series(
    TIMESTAMP '2025-10-01 00:00:00',
    TIMESTAMP '2026-03-01 23:00:00',
    INTERVAL '12 hour'
  ) AS ts
)
INSERT INTO readings (
  time, device_id, power_watts, voltage, current_amps, energy_kwh, frequency, power_factor
)
SELECT
  s.ts AS time,
  d.id AS device_id,
  CASE d.device_type
    WHEN 'aircon' THEN ROUND((1050 + random() * 350)::numeric, 2)
    WHEN 'refrigerator' THEN ROUND((130 + random() * 45)::numeric, 2)
    WHEN 'tv' THEN ROUND((70 + random() * 70)::numeric, 2)
    WHEN 'washing_machine' THEN ROUND((
      CASE
        WHEN EXTRACT(HOUR FROM s.ts) IN (7, 20) THEN 350 + random() * 250
        ELSE 7 + random() * 8
      END
    )::numeric, 2)
    WHEN 'coffee_maker' THEN ROUND((
      CASE
        WHEN EXTRACT(HOUR FROM s.ts) IN (6, 7, 8, 15, 16) THEN 700 + random() * 250
        ELSE 4 + random() * 6
      END
    )::numeric, 2)
    WHEN 'fan' THEN ROUND((
      CASE
        WHEN EXTRACT(HOUR FROM s.ts) BETWEEN 10 AND 22 THEN 35 + random() * 20
        ELSE 5 + random() * 4
      END
    )::numeric, 2)
    ELSE ROUND((40 + random() * 50)::numeric, 2)
  END AS power_watts,
  ROUND((218 + random() * 6)::numeric, 2) AS voltage,
  ROUND((
    (
      CASE d.device_type
        WHEN 'aircon' THEN 1050 + random() * 350
        WHEN 'refrigerator' THEN 130 + random() * 45
        WHEN 'tv' THEN 70 + random() * 70
        WHEN 'washing_machine' THEN CASE WHEN EXTRACT(HOUR FROM s.ts) IN (7, 20) THEN 350 + random() * 250 ELSE 7 + random() * 8 END
        WHEN 'coffee_maker' THEN CASE WHEN EXTRACT(HOUR FROM s.ts) IN (6, 7, 8, 15, 16) THEN 700 + random() * 250 ELSE 4 + random() * 6 END
        WHEN 'fan' THEN CASE WHEN EXTRACT(HOUR FROM s.ts) BETWEEN 10 AND 22 THEN 35 + random() * 20 ELSE 5 + random() * 4 END
        ELSE 40 + random() * 50
      END
    ) / (218 + random() * 6)
  )::numeric, 3) AS current_amps,
  ROUND((
    (
      CASE d.device_type
        WHEN 'aircon' THEN 1050 + random() * 350
        WHEN 'refrigerator' THEN 130 + random() * 45
        WHEN 'tv' THEN 70 + random() * 70
        WHEN 'washing_machine' THEN CASE WHEN EXTRACT(HOUR FROM s.ts) IN (7, 20) THEN 350 + random() * 250 ELSE 7 + random() * 8 END
        WHEN 'coffee_maker' THEN CASE WHEN EXTRACT(HOUR FROM s.ts) IN (6, 7, 8, 15, 16) THEN 700 + random() * 250 ELSE 4 + random() * 6 END
        WHEN 'fan' THEN CASE WHEN EXTRACT(HOUR FROM s.ts) BETWEEN 10 AND 22 THEN 35 + random() * 20 ELSE 5 + random() * 4 END
        ELSE 40 + random() * 50
      END
    ) / 1000.0
  )::numeric, 4) AS energy_kwh,
  ROUND((59.8 + random() * 0.4)::numeric, 2) AS frequency,
  ROUND((0.92 + random() * 0.07)::numeric, 2) AS power_factor
FROM active_devices d
CROSS JOIN series s;

-- 3) Ventana reciente normal (últimos 3 días), cada 1h
WITH active_devices AS (
  SELECT id, device_type
  FROM devices
  WHERE is_active = TRUE
), recent_series AS (
  SELECT generate_series(
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '30 minutes',
    INTERVAL '1 hour'
  ) AS ts
)
INSERT INTO readings (
  time, device_id, power_watts, voltage, current_amps, energy_kwh, frequency, power_factor
)
SELECT
  r.ts,
  d.id,
  CASE d.device_type
    WHEN 'aircon' THEN ROUND((1150 + random() * 120)::numeric, 2)
    WHEN 'refrigerator' THEN ROUND((145 + random() * 20)::numeric, 2)
    WHEN 'tv' THEN ROUND((95 + random() * 25)::numeric, 2)
    WHEN 'washing_machine' THEN ROUND((12 + random() * 5)::numeric, 2)
    WHEN 'coffee_maker' THEN ROUND((8 + random() * 4)::numeric, 2)
    WHEN 'fan' THEN ROUND((38 + random() * 10)::numeric, 2)
    ELSE ROUND((35 + random() * 25)::numeric, 2)
  END,
  ROUND((219 + random() * 4)::numeric, 2),
  ROUND((
    (
      CASE d.device_type
        WHEN 'aircon' THEN 1150 + random() * 120
        WHEN 'refrigerator' THEN 145 + random() * 20
        WHEN 'tv' THEN 95 + random() * 25
        WHEN 'washing_machine' THEN 12 + random() * 5
        WHEN 'coffee_maker' THEN 8 + random() * 4
        WHEN 'fan' THEN 38 + random() * 10
        ELSE 35 + random() * 25
      END
    ) / (219 + random() * 4)
  )::numeric, 3),
  ROUND((
    (
      CASE d.device_type
        WHEN 'aircon' THEN 1150 + random() * 120
        WHEN 'refrigerator' THEN 145 + random() * 20
        WHEN 'tv' THEN 95 + random() * 25
        WHEN 'washing_machine' THEN 12 + random() * 5
        WHEN 'coffee_maker' THEN 8 + random() * 4
        WHEN 'fan' THEN 38 + random() * 10
        ELSE 35 + random() * 25
      END
    ) / 1000.0
  )::numeric, 4),
  ROUND((59.9 + random() * 0.2)::numeric, 2),
  ROUND((0.95 + random() * 0.03)::numeric, 2)
FROM active_devices d
CROSS JOIN recent_series r;

-- 4) FORZAR ALERTAS en 3 dispositivos (lectura más reciente muy alta)
WITH target_alerts AS (
  SELECT id, device_type
  FROM devices
  WHERE is_active = TRUE
    AND device_type IN ('aircon', 'refrigerator', 'tv')
)
INSERT INTO readings (
  time, device_id, power_watts, voltage, current_amps, energy_kwh, frequency, power_factor
)
SELECT
  NOW() - (v.offset_min || ' minutes')::interval,
  t.id,
  v.power_watts,
  220.0,
  ROUND((v.power_watts / 220.0)::numeric, 3),
  ROUND((v.power_watts / 1000.0)::numeric, 4),
  60.0,
  0.97
FROM target_alerts t
JOIN (
  VALUES
    ('aircon', 2300.0::numeric, 1),
    ('refrigerator', 460.0::numeric, 2),
    ('tv', 780.0::numeric, 3)
) AS v(device_type, power_watts, offset_min)
  ON v.device_type = t.device_type;

-- 5) FORZAR NORMALIDAD en el resto (última lectura normal)
WITH target_ok AS (
  SELECT id, device_type
  FROM devices
  WHERE is_active = TRUE
    AND device_type IN ('washing_machine', 'coffee_maker', 'fan')
)
INSERT INTO readings (
  time, device_id, power_watts, voltage, current_amps, energy_kwh, frequency, power_factor
)
SELECT
  NOW() - (v.offset_min || ' minutes')::interval,
  t.id,
  v.power_watts,
  220.0,
  ROUND((v.power_watts / 220.0)::numeric, 3),
  ROUND((v.power_watts / 1000.0)::numeric, 4),
  60.0,
  0.98
FROM target_ok t
JOIN (
  VALUES
    ('washing_machine', 14.0::numeric, 1),
    ('coffee_maker', 9.0::numeric, 2),
    ('fan', 45.0::numeric, 3)
) AS v(device_type, power_watts, offset_min)
  ON v.device_type = t.device_type;

COMMIT;

-- ============================
-- Verificaciones rápidas
-- ============================
-- Total de lecturas cargadas
SELECT COUNT(*) AS total_readings FROM readings;

-- Última lectura por dispositivo
SELECT DISTINCT ON (r.device_id)
  r.device_id,
  d.name,
  d.device_type,
  r.time,
  r.power_watts
FROM readings r
JOIN devices d ON d.id = r.device_id
ORDER BY r.device_id, r.time DESC;
