import { pool } from "./db";
import { Location } from "../../domain/entities/Location";
import { CreateLocationDTO } from "../../domain/dtos/CreateLocationDTO";
import { ILocationRepository } from "../../domain/repositories/ILocationRepository";

export class PostgresLocationRepository implements ILocationRepository {
  async list(userId?: number): Promise<Location[]> {
    let query = `SELECT * FROM locations`;
    const params: any[] = [];
    if (userId !== undefined && userId !== null) {
      query += ` WHERE user_id = $1`;
      params.push(userId);
    }

    const res = await pool.query(query, params);
    return res.rows.map((row: any) => new Location(row.id, row.user_id, row.name, row.address));
  }

  async findById(id: number): Promise<Location | null> {
    const query =
      "SELECT * FROM locations WHERE id = $1";
    const res = await pool.query(query, [id]);

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return new Location(row.id, row.user_id, row.name, row.address);
  }

  async save(data: CreateLocationDTO): Promise<Location> {
    const query = `
      INSERT INTO locations (user_id, name, address) VALUES ($1, $2, $3) RETURNING *;
    `;
    const values = [data.userId, data.name, data.address || null];
    const res = await pool.query(query, values);
    const row = res.rows[0];

    return new Location(row.id, row.user_id, row.name, row.address);
  }

  async delete(id: number): Promise<void> {
    const query = `DELETE FROM locations WHERE id = $1;`;
    await pool.query(query, [id]);
  }

  async getDeviceCountInLocation(locationId: number): Promise<number> {
    const query = `SELECT COUNT(*) as count FROM devices WHERE location_id = $1`;
    const res = await pool.query(query, [locationId]);
    return Number(res.rows[0]?.count || 0);
  }

  async edit(data: Location, id: number): Promise<Location> {
    const query = `
      UPDATE locations SET name = $1, address = $2 WHERE id = $3
      RETURNING *;
    `;

    const values = [data.name, data.address, id];
    const res = await pool.query(query, values);
    const row = res.rows[0];

    return new Location(row.id, row.user_id, row.name, row.address);
  }
}
