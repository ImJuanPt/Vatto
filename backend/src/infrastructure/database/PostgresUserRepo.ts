import { pool } from './db';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';

export class PostgresUserRepo implements IUserRepository {
  async save(user: User): Promise<User> {
    const query = `
      INSERT INTO users (full_name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [user.fullName, user.email, user.passwordHash];
    const res = await pool.query(query, values);
    return this.mapRowToUser(res.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (res.rows.length === 0) return null;
    return this.mapRowToUser(res.rows[0]);
  }

  async findById(id: number): Promise<User | null> {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.mapRowToUser(res.rows[0]);
  }

  private mapRowToUser(row: any): User {
    return new User(row.id, row.email, row.full_name, row.password_hash);
  }
}