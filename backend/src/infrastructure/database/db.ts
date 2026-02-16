import { Pool } from 'pg';
import { config } from '../../config/env';

export const pool = new Pool({
  connectionString: config.DB_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err, client) => {
  console.error('Error inesperado en el cliente de la base de datos', err);
  process.exit(-1);
});