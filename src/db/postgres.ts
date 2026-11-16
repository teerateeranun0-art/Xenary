/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PostgreSQL backend driver (compatible with standard PostgreSQL, Neon, RDS,
 * and Supabase Direct / Pooler Postgres connection strings).
 */

import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { buildPgPoolConfig } from './config';
import {
  COLLECTION_SPECS,
  PRODUCT_COLUMNS,
  buildMultiRowUpsertQuery,
  chunkArray,
  normalizeCatalogPayload,
  productToRow,
  rowToProduct,
  type CatalogData,
  type CollectionSpec,
} from './mappers';

declare global {
  var __xenaryPgPool: Pool | undefined;
}

const JSONB_COLUMNS = new Set([
  'plans',
  'features',
  'extra',
  'product',
  'plan',
  'keys_delivered',
  'payload',
]);

export type SeedReader = <T>(name: string, fallback: T) => T;

const SEED_COLLECTIONS = [
  'users.json',
  'sessions.json',
  'keys.json',
  'orders.json',
  'topups.json',
  'manual_topups.json',
  'coupons.json',
  'coupon_uses.json',
  'news.json',
  'payment_channels.json',
  'support_links.json',
] as const;

export class PostgresStore {
  private pool: Pool;
  private schemaPath: string;
  private readSeed: SeedReader;
  private schemaReady: Promise<void> | null = null;
  private seeded = false;
  private seedReady: Promise<void> | null = null;

  constructor(options: { schemaPath: string; readSeed: SeedReader; env?: NodeJS.ProcessEnv }) {
    this.schemaPath = options.schemaPath;
    this.readSeed = options.readSeed;

    if (!globalThis.__xenaryPgPool) {
      const pool = new Pool(buildPgPoolConfig(options.env));
      pool.on('error', (err) => {
        console.error('[PostgresStore] Idle client error:', err);
      });
      globalThis.__xenaryPgPool = pool;
    }
    this.pool = globalThis.__xenaryPgPool;
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        const sql = fs.readFileSync(this.schemaPath, 'utf8');
        await this.pool.query(sql);
      })().catch((err) => {
        this.schemaReady = null;
        throw new Error(`[PostgresStore] Failed to initialize schema: ${err.message}`, { cause: err });
      });
    }
    await this.schemaReady;
  }

  private async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    if (!this.seedReady) {
      this.seedReady = (async () => {
        await this.ensureSchema();
        const [{ rows: pRows }, { rows: uRows }] = await Promise.all([
          this.pool.query('SELECT COUNT(*)::int AS cnt FROM products'),
          this.pool.query('SELECT COUNT(*)::int AS cnt FROM users'),
        ]);
        const pCount = Number(pRows[0]?.cnt) || 0;
        const uCount = Number(uRows[0]?.cnt) || 0;

        if (pCount === 0 && uCount === 0) {
          const client = await this.pool.connect();
          try {
            await client.query('BEGIN');
            const catalog = normalizeCatalogPayload(this.readSeed('products.json', { products: [] }));
            await this.upsertStoreSetting(client, 'catalog_meta', {
              store: catalog.store,
              currency: catalog.currency,
              currencySymbol: catalog.currencySymbol,
              updatedAt: catalog.updatedAt,
              checkout: catalog.checkout,
            });
            if (catalog.products.length > 0) {
              await this.upsertRows(
                client,
                'products',
                PRODUCT_COLUMNS,
                'id',
                catalog.products.map(productToRow),
                true
              );
            }
            const settings = this.readSeed<Record<string, any>>('settings.json', {});
            if (settings && Object.keys(settings).length > 0) {
              await this.upsertStoreSetting(client, 'default', settings, true);
            }
            for (const name of SEED_COLLECTIONS) {
              const spec = COLLECTION_SPECS[name];
              const items = this.readSeed<any[]>(name, []);
              if (Array.isArray(items) && items.length > 0) {
                await this.upsertRows(
                  client,
                  spec.table,
                  spec.columns,
                  spec.conflictTarget,
                  items.map((item) => spec.toRow(item)),
                  true
                );
              }
            }
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
          } finally {
            client.release();
          }
        }
        this.seeded = true;
      })().catch((err) => {
        this.seedReady = null;
        throw new Error(`[PostgresStore] Failed to seed initial data: ${err.message}`, { cause: err });
      });
    }
    await this.seedReady;
  }

  private async upsertStoreSetting(
    client: PoolClient,
    id: string,
    payload: Record<string, any>,
    doNothing = false
  ): Promise<void> {
    const conflictClause = doNothing
      ? 'ON CONFLICT (id) DO NOTHING'
      : 'ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()';
    await client.query(
      `INSERT INTO store_settings (id, payload, updated_at) VALUES ($1, $2::jsonb, NOW()) ${conflictClause}`,
      [id, JSON.stringify(payload || {})]
    );
  }

  private async upsertRows(
    client: PoolClient,
    table: string,
    columns: readonly string[],
    conflictTarget: string,
    rows: Record<string, any>[],
    doNothing = false
  ): Promise<void> {
    if (!rows.length) return;
    for (const batch of chunkArray(rows, 100)) {
      const { sql, values } = buildMultiRowUpsertQuery({
        table,
        columns,
        conflictTarget,
        rows: batch,
        jsonbColumns: JSONB_COLUMNS,
        doNothing,
      });
      await client.query(sql, values);
    }
  }

  private async syncTableRows(
    table: string,
    columns: readonly string[],
    conflictTarget: string,
    rows: Record<string, any>[]
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const ids = rows.map((r) => String(r[conflictTarget]));
      if (ids.length === 0) {
        await client.query(`DELETE FROM ${table}`);
      } else {
        await client.query(`DELETE FROM ${table} WHERE ${conflictTarget} <> ALL($1::text[])`, [ids]);
        await this.upsertRows(client, table, columns, conflictTarget, rows, false);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async readCollection<T>(name: string, fallback: T): Promise<T> {
    await this.ensureSeeded();
    try {
      if (name === 'settings.json') {
        const { rows } = await this.pool.query(
          'SELECT payload FROM store_settings WHERE id = $1',
          ['default']
        );
        if (rows.length === 0) return fallback;
        return (rows[0].payload || fallback) as T;
      }

      if (name === 'products.json') {
        const [{ rows: prodRows }, { rows: metaRows }] = await Promise.all([
          this.pool.query('SELECT * FROM products ORDER BY updated_at ASC, id ASC'),
          this.pool.query('SELECT payload FROM store_settings WHERE id = $1', ['catalog_meta']),
        ]);
        const meta = metaRows[0]?.payload || {};
        return normalizeCatalogPayload({
          ...meta,
          products: prodRows.map(rowToProduct),
        }) as unknown as T;
      }

      const spec: CollectionSpec | undefined = COLLECTION_SPECS[name];
      if (!spec) {
        return fallback;
      }
      const orderSql = spec.orderBy ? ` ORDER BY ${spec.orderBy}` : '';
      const { rows } = await this.pool.query(`SELECT * FROM ${spec.table}${orderSql}`);
      return rows.map((r) => spec.fromRow(r)) as unknown as T;
    } catch (err: any) {
      throw new Error(`[PostgresStore] Failed to read ${name}: ${err.message}`, { cause: err });
    }
  }

  async writeCollection<T>(name: string, data: T): Promise<void> {
    await this.ensureSeeded();
    try {
      if (name === 'settings.json') {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await this.upsertStoreSetting(client, 'default', (data || {}) as Record<string, any>);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
        return;
      }

      if (name === 'products.json') {
        const catalog = normalizeCatalogPayload(data);
        const rows = catalog.products.map(productToRow);
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await this.upsertStoreSetting(client, 'catalog_meta', {
            store: catalog.store,
            currency: catalog.currency,
            currencySymbol: catalog.currencySymbol,
            updatedAt: catalog.updatedAt,
            checkout: catalog.checkout,
          });
          const ids = rows.map((r) => String(r.id));
          if (ids.length === 0) {
            await client.query('DELETE FROM products');
          } else {
            await client.query('DELETE FROM products WHERE id <> ALL($1::text[])', [ids]);
            await this.upsertRows(client, 'products', PRODUCT_COLUMNS, 'id', rows, false);
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
        return;
      }

      const spec = COLLECTION_SPECS[name];
      if (!spec || !Array.isArray(data)) return;
      const rows = data.map((item) => spec.toRow(item));
      await this.syncTableRows(spec.table, spec.columns, spec.conflictTarget, rows);
    } catch (err: any) {
      throw new Error(`[PostgresStore] Failed to write ${name}: ${err.message}`, { cause: err });
    }
  }

  async ping(): Promise<boolean> {
    await this.pool.query('SELECT 1');
    return true;
  }
}

export function resolveDefaultSchemaPath(baseDir: string): string {
  return path.join(baseDir, 'supabase', 'schema.sql');
}
