import { randomUUID } from 'crypto';
import { pool } from './db';

export interface DeferredLinkRecord {
  id: string;
  code: string;
  macAddress: string;
  model: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
}

interface RegisterDeferredLinkInput {
  macAddress: string;
  model?: string;
  sourceIp?: string;
  userAgent?: string;
  ttlMinutes?: number;
}

export class DeferredLinkStore {
  private initPromise: Promise<void> | null = null;

  private ensureInitialized() {
    if (!this.initPromise) {
      this.initPromise = this.initializeTable();
    }

    return this.initPromise;
  }

  private async initializeTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deferred_links (
        id TEXT PRIMARY KEY,
        code VARCHAR(12) UNIQUE NOT NULL,
        mac_address VARCHAR(32) NOT NULL,
        model VARCHAR(64),
        source_ip VARCHAR(64),
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        consumed_at TIMESTAMPTZ
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deferred_links_source_ip_created
      ON deferred_links (source_ip, created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deferred_links_expires_at
      ON deferred_links (expires_at);
    `);
  }

  private normalizeMac(macAddress: string) {
    return macAddress.trim().toUpperCase().replace(/-/g, ':');
  }

  private generateShortCode() {
    // 8 chars base36 uppercase, user-friendly for manual recovery fallback
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    return code.padEnd(8, '0').slice(0, 8);
  }

  async cleanupExpired() {
    await this.ensureInitialized();
    await pool.query(
      `DELETE FROM deferred_links WHERE expires_at < NOW() OR consumed_at IS NOT NULL`
    );
  }

  async register(input: RegisterDeferredLinkInput): Promise<DeferredLinkRecord> {
    await this.ensureInitialized();

    const ttlMinutes = Math.max(5, Math.min(60 * 24, input.ttlMinutes ?? 120));
    const id = randomUUID();

    // retries to avoid rare short-code collisions
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateShortCode();
      try {
        const result = await pool.query(
          `
          INSERT INTO deferred_links (id, code, mac_address, model, source_ip, user_agent, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' minutes')::interval)
          RETURNING
            id,
            code,
            mac_address,
            model,
            source_ip,
            user_agent,
            expires_at,
            created_at
          `,
          [
            id,
            code,
            this.normalizeMac(input.macAddress),
            input.model?.trim() || null,
            input.sourceIp?.trim() || null,
            input.userAgent?.trim() || null,
            String(ttlMinutes),
          ]
        );

        const row = result.rows[0];
        return {
          id: row.id,
          code: row.code,
          macAddress: row.mac_address,
          model: row.model,
          sourceIp: row.source_ip,
          userAgent: row.user_agent,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        };
      } catch (error: any) {
        if (error?.code === '23505' && String(error?.constraint || '').includes('code')) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate deferred-link code');
  }

  async resolveLatestByIp(sourceIp: string): Promise<DeferredLinkRecord | null> {
    await this.ensureInitialized();

    const result = await pool.query(
      `
      SELECT
        id,
        code,
        mac_address,
        model,
        source_ip,
        user_agent,
        expires_at,
        created_at
      FROM deferred_links
      WHERE source_ip = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [sourceIp]
    );

    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      code: row.code,
      macAddress: row.mac_address,
      model: row.model,
      sourceIp: row.source_ip,
      userAgent: row.user_agent,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async resolveByIdOrCode(input: {
    id?: string;
    code?: string;
  }): Promise<DeferredLinkRecord | null> {
    await this.ensureInitialized();

    if (!input.id && !input.code) return null;

    const result = await pool.query(
      `
      SELECT
        id,
        code,
        mac_address,
        model,
        source_ip,
        user_agent,
        expires_at,
        created_at
      FROM deferred_links
      WHERE ($1::text IS NOT NULL AND id = $1)
         OR ($2::text IS NOT NULL AND code = UPPER($2))
      LIMIT 1
      `,
      [input.id ?? null, input.code ?? null]
    );

    if (!result.rows.length) return null;

    const row = result.rows[0];
    const expired = new Date(row.expires_at).getTime() <= Date.now();
    if (expired) return null;

    return {
      id: row.id,
      code: row.code,
      macAddress: row.mac_address,
      model: row.model,
      sourceIp: row.source_ip,
      userAgent: row.user_agent,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async consumeById(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await pool.query(
      `
      UPDATE deferred_links
      SET consumed_at = NOW(),
          resolved_at = COALESCE(resolved_at, NOW())
      WHERE id = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      `,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }
}
