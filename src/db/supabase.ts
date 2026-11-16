/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Supabase backend driver using @supabase/supabase-js (PostgREST).
 * Requires schema from supabase/schema.sql to exist in the target Supabase project.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig } from './config';
import {
  COLLECTION_SPECS,
  normalizeCatalogPayload,
  productToRow,
  rowToProduct,
} from './mappers';
import type { SeedReader } from './postgres';

declare global {
  var __xenarySupabaseClient: SupabaseClient | undefined;
}

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

export class SupabaseStore {
  private client: SupabaseClient;
  private readSeed: SeedReader;
  private seeded = false;
  private seedReady: Promise<void> | null = null;

  constructor(options: { readSeed: SeedReader; env?: NodeJS.ProcessEnv }) {
    const cfg = resolveSupabaseConfig(options.env);
    if (!cfg) {
      throw new Error('[SupabaseStore] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY');
    }
    this.readSeed = options.readSeed;

    if (!globalThis.__xenarySupabaseClient) {
      globalThis.__xenarySupabaseClient = createClient(cfg.url, cfg.key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
    this.client = globalThis.__xenarySupabaseClient;
  }

  private assertOk<T>(result: { data: T; error: any }, context: string): T {
    if (result.error) {
      const msg = result.error.message || JSON.stringify(result.error);
      throw new Error(`[SupabaseStore] ${context}: ${msg}`, { cause: result.error });
    }
    return result.data;
  }

  private async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    if (!this.seedReady) {
      this.seedReady = (async () => {
        const [{ count: pCount, error: pErr }, { count: uCount, error: uErr }] = await Promise.all([
          this.client.from('products').select('id', { count: 'exact', head: true }),
          this.client.from('users').select('id', { count: 'exact', head: true }),
        ]);

        if (pErr) {
          throw new Error(
            `[SupabaseStore] Table check failed (${pErr.message}). Ensure supabase/schema.sql has been applied.`,
            { cause: pErr }
          );
        }
        if (uErr) {
          throw new Error(`[SupabaseStore] Users table check failed (${uErr.message})`, { cause: uErr });
        }

        if ((pCount || 0) === 0 && (uCount || 0) === 0) {
          const catalog = normalizeCatalogPayload(this.readSeed('products.json', { products: [] }));
          this.assertOk(
            await this.client.from('store_settings').upsert(
              {
                id: 'catalog_meta',
                payload: {
                  store: catalog.store,
                  currency: catalog.currency,
                  currencySymbol: catalog.currencySymbol,
                  updatedAt: catalog.updatedAt,
                  checkout: catalog.checkout,
                },
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'id', ignoreDuplicates: true }
            ),
            'seed catalog_meta'
          );

          if (catalog.products.length > 0) {
            this.assertOk(
              await this.client
                .from('products')
                .upsert(catalog.products.map(productToRow), { onConflict: 'id', ignoreDuplicates: true }),
              'seed products'
            );
          }

          const settings = this.readSeed<Record<string, any>>('settings.json', {});
          if (settings && Object.keys(settings).length > 0) {
            this.assertOk(
              await this.client.from('store_settings').upsert(
                { id: 'default', payload: settings, updated_at: new Date().toISOString() },
                { onConflict: 'id', ignoreDuplicates: true }
              ),
              'seed default settings'
            );
          }

          for (const name of SEED_COLLECTIONS) {
            const spec = COLLECTION_SPECS[name];
            const items = this.readSeed<any[]>(name, []);
            if (Array.isArray(items) && items.length > 0) {
              this.assertOk(
                await this.client
                  .from(spec.table)
                  .upsert(items.map(spec.toRow), { onConflict: spec.conflictTarget, ignoreDuplicates: true }),
                `seed ${spec.table}`
              );
            }
          }
        }
        this.seeded = true;
      })().catch((err) => {
        this.seedReady = null;
        throw err;
      });
    }
    await this.seedReady;
  }

  private async syncTableRows(
    table: string,
    conflictTarget: string,
    rows: Record<string, any>[]
  ): Promise<void> {
    const existing = this.assertOk(
      await this.client.from(table).select(conflictTarget),
      `fetch existing ids from ${table}`
    ) as Record<string, any>[];

    const targetIds = new Set(rows.map((r) => String(r[conflictTarget])));
    const toDelete = (existing || [])
      .map((r) => String(r[conflictTarget]))
      .filter((id) => !targetIds.has(id));

    if (rows.length > 0) {
      this.assertOk(
        await this.client.from(table).upsert(rows, { onConflict: conflictTarget }),
        `upsert rows into ${table}`
      );
    }

    if (toDelete.length > 0) {
      this.assertOk(
        await this.client.from(table).delete().in(conflictTarget, toDelete),
        `delete stale rows from ${table}`
      );
    }
  }

  async readCollection<T>(name: string, fallback: T): Promise<T> {
    await this.ensureSeeded();
    if (name === 'settings.json') {
      const rows = this.assertOk(
        await this.client.from('store_settings').select('payload').eq('id', 'default').limit(1),
        'read settings'
      );
      if (!rows || rows.length === 0) return fallback;
      return (rows[0].payload || fallback) as T;
    }

    if (name === 'products.json') {
      const [prodRows, metaRows] = await Promise.all([
        this.client.from('products').select('*').order('updated_at', { ascending: true }),
        this.client.from('store_settings').select('payload').eq('id', 'catalog_meta').limit(1),
      ]);
      const products = this.assertOk(prodRows, 'read products');
      const metaList = this.assertOk(metaRows, 'read catalog_meta');
      const meta = metaList?.[0]?.payload || {};
      return normalizeCatalogPayload({
        ...meta,
        products: (products || []).map(rowToProduct),
      }) as unknown as T;
    }

    const spec = COLLECTION_SPECS[name];
    if (!spec) return fallback;

    let query = this.client.from(spec.table).select('*');
    if (spec.orderBy) {
      const firstOrder = spec.orderBy.split(',')[0].trim();
      const [col, dir] = firstOrder.split(/\s+/);
      query = query.order(col, { ascending: (dir || 'ASC').toUpperCase() !== 'DESC' });
    }
    const rows = this.assertOk(await query, `read ${spec.table}`);
    return (rows || []).map((r) => spec.fromRow(r)) as unknown as T;
  }

  async writeCollection<T>(name: string, data: T): Promise<void> {
    await this.ensureSeeded();
    if (name === 'settings.json') {
      this.assertOk(
        await this.client.from('store_settings').upsert(
          {
            id: 'default',
            payload: data || {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        ),
        'write settings'
      );
      return;
    }

    if (name === 'products.json') {
      const catalog = normalizeCatalogPayload(data);
      this.assertOk(
        await this.client.from('store_settings').upsert(
          {
            id: 'catalog_meta',
            payload: {
              store: catalog.store,
              currency: catalog.currency,
              currencySymbol: catalog.currencySymbol,
              updatedAt: catalog.updatedAt,
              checkout: catalog.checkout,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        ),
        'write catalog_meta'
      );
      const rows = catalog.products.map(productToRow);
      await this.syncTableRows('products', 'id', rows);
      return;
    }

    const spec = COLLECTION_SPECS[name];
    if (!spec || !Array.isArray(data)) return;
    const rows = data.map((item) => spec.toRow(item));
    await this.syncTableRows(spec.table, spec.conflictTarget, rows);
  }
}
