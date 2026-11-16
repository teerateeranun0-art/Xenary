/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unified Persistence Adapter for XENARY Store.
 * Seamlessly supports PostgreSQL (pg), Supabase (@supabase/supabase-js), and
 * local atomic JSON storage fallback when database secrets are not configured.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveDbConfig, type DbDriver } from './config';
import { normalizeCatalogPayload, type CatalogData } from './mappers';
import { PostgresStore, resolveDefaultSchemaPath } from './postgres';
import { SupabaseStore } from './supabase';

export interface DbCapabilities {
  driver: DbDriver;
  postgresConfigured: boolean;
  supabaseConfigured: boolean;
  supportedDrivers: readonly string[];
}

export interface StoreBackend {
  readCollection<T>(name: string, fallback: T): Promise<T>;
  writeCollection<T>(name: string, data: T): Promise<void>;
}

export class JsonFileStore implements StoreBackend {
  constructor(private dataDir: string) {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  readSync<T>(name: string, fallback: T): T {
    const file = path.join(this.dataDir, name);
    try {
      if (!fs.existsSync(file)) return fallback;
      const raw = fs.readFileSync(file, 'utf8');
      if (!raw.trim()) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  writeSync<T>(name: string, data: T): void {
    const file = path.join(this.dataDir, name);
    const tmp = `${file}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, file);
    } catch (err) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {}
      throw err;
    }
  }

  async readCollection<T>(name: string, fallback: T): Promise<T> {
    return this.readSync(name, fallback);
  }

  async writeCollection<T>(name: string, data: T): Promise<void> {
    this.writeSync(name, data);
  }
}

export class UnifiedStore {
  public readonly driver: DbDriver;
  private readonly hasPostgres: boolean;
  private readonly hasSupabase: boolean;
  private readonly backend: StoreBackend;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(options: {
    rootDir: string;
    dataDir?: string;
    env?: NodeJS.ProcessEnv;
  }) {
    const env = options.env || process.env;
    const dataDir = options.dataDir || path.join(options.rootDir, 'src', 'data');
    const jsonStore = new JsonFileStore(dataDir);
    const resolved = resolveDbConfig(env);

    this.driver = resolved.driver;
    this.hasPostgres = resolved.hasPostgres;
    this.hasSupabase = resolved.hasSupabase;

    if (this.driver === 'postgres') {
      this.backend = new PostgresStore({
        schemaPath: resolveDefaultSchemaPath(options.rootDir),
        readSeed: (name, fallback) => jsonStore.readSync(name, fallback),
        env,
      });
    } else if (this.driver === 'supabase') {
      this.backend = new SupabaseStore({
        readSeed: (name, fallback) => jsonStore.readSync(name, fallback),
        env,
      });
    } else {
      this.backend = jsonStore;
    }
  }

  getCapabilities(): DbCapabilities {
    return {
      driver: this.driver,
      postgresConfigured: this.hasPostgres,
      supabaseConfigured: this.hasSupabase,
      supportedDrivers: ['postgres', 'supabase', 'firestore', 'json'],
    };
  }

  async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) || Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => current);
    this.locks.set(key, tail);
    await prev;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === tail) {
        this.locks.delete(key);
      }
    }
  }

  readCollection<T>(name: string, fallback: T): Promise<T> {
    return this.backend.readCollection(name, fallback);
  }

  writeCollection<T>(name: string, data: T): Promise<void> {
    return this.backend.writeCollection(name, data);
  }

  async getCatalogData(): Promise<CatalogData> {
    const raw = await this.readCollection<any>('products.json', { products: [] });
    return normalizeCatalogPayload(raw);
  }

  async saveProductsList(products: any[]): Promise<void> {
    const cat = await this.getCatalogData();
    cat.products = products;
    cat.updatedAt = new Date().toISOString().slice(0, 10);
    await this.writeCollection('products.json', cat);
  }
}

export function createStoreAdapter(options: {
  rootDir: string;
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
}): UnifiedStore {
  return new UnifiedStore(options);
}
