import { pool } from "./db";
import { CreateDeviceDTO } from "../../domain/dtos/CreateDeviceDTO";
import { IDeviceRepository } from "../../domain/repositories/IDeviceRepository";
import { Device } from "../../domain/entities/Device";

export class PostgresDeviceRepository implements IDeviceRepository {
  async list(userId?: number): Promise<Device[]> {
    let query = `SELECT d.id, d.location_id, d.name, d.device_type, d.max_watts_threshold, d.mac_address, d.is_active, d.current_state, d.created_at FROM devices d`;
    const params: any[] = [];
    if (userId !== undefined && userId !== null) {
      query += ` JOIN locations l ON d.location_id = l.id WHERE l.user_id = $1`;
      params.push(userId);
    }

    const res = await pool.query(query, params);
    return res.rows.map((row: any) =>
      new Device(
        row.id,
        row.location_id,
        row.name,
        row.device_type,
        row.max_watts_threshold,
        row.mac_address,
        row.is_active,
        row.pairing_code || null
      )
    );
  }

  async findById(id: number): Promise<Device | null> {
    const query =
      "SELECT id, location_id, name, device_type, max_watts_threshold, mac_address, is_active FROM devices WHERE id = $1";
    const res = await pool.query(query, [id]);

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return new Device(
      row.id,
      row.location_id,
      row.name,
      row.device_type,
      row.max_watts_threshold,
      row.mac_address,
      row.is_active,
      row.pairing_code || null
    );
  }

  async findByMac(mac: string): Promise<Device | null> {
    const query = `SELECT id, location_id, name, device_type, max_watts_threshold, mac_address, is_active FROM devices WHERE lower(mac_address) = lower($1) LIMIT 1`;
    const res = await pool.query(query, [mac]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return new Device(
      row.id,
      row.location_id,
      row.name,
      row.device_type,
      row.max_watts_threshold,
      row.mac_address,
      row.is_active,
      row.pairing_code || null
    );
  }

  async save(data: CreateDeviceDTO): Promise<Device> {
    // generate a 6-digit pairing code
    const pairingCode = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");

    const query = `
      INSERT INTO devices (name, device_type, location_id, max_watts_threshold, mac_address, pairing_code, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const values = [
      data.name,
      data.deviceType,
      data.locationId,
      data.maxWattsThreshold,
      data.macAddress || null,
      pairingCode,
      false,
    ];
    const res = await pool.query(query, values);
    const row = res.rows[0];

    return new Device(
      row.id,
      row.location_id,
      row.name,
      row.device_type,
      row.max_watts_threshold,
      row.mac_address,
      row.is_active,
      row.pairing_code || pairingCode
    );
  }

  async delete(id: number): Promise<void> {
    const query = `DELETE FROM devices WHERE id = $1;`;
    await pool.query(query, [id]);
  }

  async getDevicesByLocation(locationId: number): Promise<Device[]> {
    const query = `SELECT id, location_id, name, device_type, max_watts_threshold, mac_address, is_active FROM devices WHERE location_id = $1`;
    const res = await pool.query(query, [locationId]);
    return res.rows.map((row: any) =>
      new Device(
        row.id,
        row.location_id,
        row.name,
        row.device_type,
        row.max_watts_threshold,
        row.mac_address,
        row.is_active,
        row.pairing_code || null
      )
    );
  }

  async moveDeviceToLocation(deviceId: number, newLocationId: number): Promise<Device> {
    const query = `UPDATE devices SET location_id = $1 WHERE id = $2 RETURNING *;`;
    const res = await pool.query(query, [newLocationId, deviceId]);
    const row = res.rows[0];
    
    return new Device(
      row.id,
      row.location_id,
      row.name,
      row.device_type,
      row.max_watts_threshold,
      row.mac_address,
      row.is_active,
      row.pairing_code || null
    );
  }

  async updateDeviceName(deviceId: number, newName: string): Promise<Device> {
    const query = `UPDATE devices SET name = $1 WHERE id = $2 RETURNING *;`;
    const res = await pool.query(query, [newName, deviceId]);
    const row = res.rows[0];
    
    return new Device(
      row.id,
      row.location_id,
      row.name,
      row.device_type,
      row.max_watts_threshold,
      row.mac_address,
      row.is_active,
      row.pairing_code || null
    );
  }

  async edit(data: Device, id: number): Promise<Device> {
    const query = `
      UPDATE devices SET name = $1, device_type = $2, location_id = $3, max_watts_threshold = $4, mac_address = $5 WHERE id = $6
      RETURNING *;
    `;

    const values = [
      data.name,
      data.deviceType,
      data.locationId,
      data.maxWattsThreshold,
      data.macAddress,
      id,
    ];
    const res = await pool.query(query, values);
    const row = res.rows[0];

    return new Device(
      row.id,
      row.location_id,
      row.name,
      row.device_type,
      row.max_watts_threshold,
      row.mac_address,
      row.is_active
    );
  }
  async getDailyUsage(): Promise<{ device_id: number, kwh_24h: number }[]> {
    const query = `
      WITH intervals AS (
        SELECT
          device_id,
          time AS start_time,
          LEAD(time) OVER (PARTITION BY device_id ORDER BY time) AS end_time,
          power_watts
        FROM readings
        WHERE time >= NOW() - INTERVAL '24 hours'
      )
      SELECT device_id,
        SUM(
          (EXTRACT(EPOCH FROM COALESCE(end_time, NOW()) - start_time) / 3600) * (power_watts) / 1000
        ) AS kwh_24h
      FROM intervals
      GROUP BY device_id;
    `;
    const res = await pool.query(query);
    return res.rows.map((row: any) => ({
      device_id: Number(row.device_id),
      kwh_24h: Number(row.kwh_24h) || 0
    }));
  }

  async getMonthlyUsage(): Promise<{ device_id: number, kwh_30d: number }[]> {
    const query = `
      WITH readings_with_lag AS (
        SELECT
          device_id,
          power_watts,
          time,
          LAG(time) OVER (PARTITION BY device_id ORDER BY time) as prev_time
        FROM readings
        WHERE time >= NOW() - INTERVAL '30 days'
      ),
      consumption AS (
        SELECT
          device_id,
          COALESCE(
            SUM((EXTRACT(EPOCH FROM time - prev_time) / 3600.0) * power_watts / 1000.0),
            0
          ) as kwh_30d
        FROM readings_with_lag
        WHERE prev_time IS NOT NULL
        GROUP BY device_id
      )
      SELECT device_id, COALESCE(kwh_30d, 0) as kwh_30d FROM consumption
      UNION ALL
      SELECT DISTINCT device_id, 0 as kwh_30d 
      FROM readings 
      WHERE device_id NOT IN (SELECT device_id FROM consumption)
        AND time >= NOW() - INTERVAL '30 days';
    `;
    const res = await pool.query(query);
    return res.rows.map((row: any) => ({
      device_id: Number(row.device_id),
      kwh_30d: Number(row.kwh_30d) || 0
    }));
  }

  async getDailyHours(): Promise<{ device_id: number, hours_per_day: number }[]> {
    const query = `
      WITH readings_with_lag AS (
        SELECT
          device_id,
          DATE(time) as day,
          time,
          LAG(time) OVER (PARTITION BY device_id, DATE(time) ORDER BY time) as prev_time
        FROM readings
        WHERE time >= NOW() - INTERVAL '30 days'
      ),
      daily_hours AS (
        SELECT
          device_id,
          day,
          COALESCE(
            SUM(EXTRACT(EPOCH FROM time - prev_time) / 3600.0),
            0
          ) as hours
        FROM readings_with_lag
        WHERE prev_time IS NOT NULL
        GROUP BY device_id, day
      ),
      avg_hours AS (
        SELECT device_id, COALESCE(AVG(hours), 0) as hours_per_day
        FROM daily_hours
        WHERE hours > 0
        GROUP BY device_id
      )
      SELECT device_id, hours_per_day FROM avg_hours
      UNION ALL
      SELECT DISTINCT device_id, 0 as hours_per_day
      FROM readings
      WHERE device_id NOT IN (SELECT device_id FROM avg_hours)
        AND time >= NOW() - INTERVAL '30 days';
    `;
    const res = await pool.query(query);
    return res.rows.map((row: any) => ({
      device_id: Number(row.device_id),
      hours_per_day: Number(row.hours_per_day) || 0
    }));
  }

  // Find device by temporary pairing code (only if not yet active)
  async findByPairingCode(code: string): Promise<Device | null> {
    const query = `SELECT id, location_id, name, device_type, max_watts_threshold, mac_address, is_active, pairing_code FROM devices WHERE pairing_code = $1 LIMIT 1`;
    const res = await pool.query(query, [code]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return new Device(
      row.id,
      row.location_id,
      row.name,
      row.device_type,
      row.max_watts_threshold,
      row.mac_address,
      row.is_active,
      row.pairing_code || null
    );
  }

  async updateMacAddress(deviceId: number, macAddress: string): Promise<boolean> {
    const query = `UPDATE devices SET mac_address = $1 WHERE id = $2`;
    const res = await pool.query(query, [macAddress, deviceId]);
    return (res.rowCount ?? 0) > 0;
  }

  async setActive(deviceId: number, active: boolean): Promise<boolean> {
    const query = `UPDATE devices SET is_active = $1, pairing_code = NULL WHERE id = $2`;
    const res = await pool.query(query, [active, deviceId]);
    return (res.rowCount ?? 0) > 0;
  }

  async updateMaxWattsThreshold(deviceId: number, maxWatts: number): Promise<boolean> {
    const query = `UPDATE devices SET max_watts_threshold = $1 WHERE id = $2`;
    const res = await pool.query(query, [maxWatts, deviceId]);
    return (res.rowCount ?? 0) > 0;
  }

  async updateCurrentState(deviceId: number, state: 'on' | 'off'): Promise<boolean> {
    const query = `UPDATE devices SET current_state = $1 WHERE id = $2`;
    const res = await pool.query(query, [state, deviceId]);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Obtiene el estado actual (ON/OFF) de cada dispositivo basado en su última lectura
   * Si power_watts > 0 → ON, si power_watts = 0 → OFF
   */
  async getCurrentStateForAllDevices(): Promise<{ device_id: number; current_state: string }[]> {
    const query = `
      WITH latest_readings AS (
        SELECT DISTINCT ON (device_id)
          device_id,
          power_watts
        FROM readings
        ORDER BY device_id, time DESC
      )
      SELECT
        d.id as device_id,
        CASE 
          WHEN lr.power_watts > 0 THEN 'on'
          ELSE 'off'
        END as current_state
      FROM devices d
      LEFT JOIN latest_readings lr ON d.id = lr.device_id
      ORDER BY d.id;
    `;

    const res = await pool.query(query);
    return res.rows.map((row: any) => ({
      device_id: Number(row.device_id),
      current_state: row.current_state || 'off'
    }));
  }

  /**
   * Elimina dispositivos que:
   * - No han completado el pairing (is_active = false)
   * - Aún tienen código de vinculación válido
   * - Fueron creados hace más de X minutos (default 60 minutos)
   */
  /**
   * Calcula la potencia típica (máximo de power_watts) para todos los dispositivos
   * basada en lecturas de los últimos 30 días
   */
  async getTypicalWattageForAllDevices(): Promise<{ device_id: number; peak_watts: number }[]> {
    const query = `
      WITH peak_by_device AS (
        SELECT
          device_id,
          MAX(power_watts) as peak_watts
        FROM readings
        WHERE time >= NOW() - INTERVAL '30 days'
          AND power_watts > 0
        GROUP BY device_id
      )
      SELECT device_id, COALESCE(peak_watts, 0) as peak_watts
      FROM peak_by_device
      UNION ALL
      SELECT DISTINCT id as device_id, 0 as peak_watts
      FROM devices
      WHERE id NOT IN (SELECT device_id FROM peak_by_device);
    `;

    const res = await pool.query(query);
    return res.rows.map((row: any) => ({
      device_id: Number(row.device_id),
      peak_watts: Number(row.peak_watts)
    }));
  }

  async cleanupExpiredPairingDevices(expirationMinutes: number = 60): Promise<number> {
    const query = `
      DELETE FROM devices 
      WHERE is_active = false 
        AND pairing_code IS NOT NULL
        AND created_at < NOW() - INTERVAL '${expirationMinutes} minutes'
      RETURNING id;
    `;
    const res = await pool.query(query);
    return res.rowCount ?? 0;
  }
}