import { pool } from "./db";
import { IReadingRepository } from "../../domain/repositories/IReadingRepository";
import { Reading } from "../../domain/entities/Reading";

export class PostgresReadingRepository implements IReadingRepository {
  async save(reading: Reading): Promise<void> {
    const query = `
      INSERT INTO readings (device_id, power_watts, voltage, current_amps, energy_kwh, frequency, power_factor, time)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const values = [
      reading.deviceId,
      reading.powerWatts,
      reading.voltage,
      reading.currentAmps,
      reading.energyKwh,
      reading.frequency,
      reading.powerFactor,
      reading.time,
    ];

    try {
      await pool.query(query, values);
    } catch (error) {
      console.error("Error guardando lectura en Postgres:", error);
      throw new Error("Database Error");
    }
  }

  async getLastReadings(deviceId: number, limit: number): Promise<any[]> {
    const query = `
      SELECT device_id, power_watts, voltage, current_amps, energy_kwh, frequency, power_factor, time
      FROM readings
      WHERE device_id = $1
      ORDER BY time DESC
      LIMIT $2
    `;

    const res = await pool.query(query, [deviceId, limit]);

    return res.rows.map((row) => ({
      deviceId: row.device_id,
      powerWatts: parseFloat(row.power_watts),
      voltage: parseFloat(row.voltage),
      currentAmps: parseFloat(row.current_amps),
      energyKwh: parseFloat(row.energy_kwh),
      frequency: parseFloat(row.frequency),
      powerFactor: parseFloat(row.power_factor),
      time: row.time,
    }));
  }
}

