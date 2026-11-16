/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure database driver detection and connection configuration helpers
 * for PostgreSQL and Supabase backends.
 */

import type { PoolConfig } from 'pg';

export type DbDriver = 'postgres' | 'supabase' | 'json';

export interface SupabaseConnectionConfig {
  url: string;
  key: string;
  isServiceRole: boolean;
}

export interface ResolvedDbConfig {
  driver: DbDriver;
  hasPostgres: boolean;
  hasSupabase: boolean;
}

function cleanEnv(val: string | undefined): string {
  return String(val || '').trim();
}

export function getPostgresConnectionString(env: NodeJS.ProcessEnv = process.env): string {
  return (
    cleanEnv(env.DATABASE_URL) ||
    cleanEnv(env.POSTGRES_URL) ||
    cleanEnv(env.POSTGRESQL_URL) ||
    cleanEnv(env.SUPABASE_DB_URL)
  );
}

export function hasPostgresConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  if (getPostgresConnectionString(env)) return true;
  const host = cleanEnv(env.PGHOST) || cleanEnv(env.SQL_HOST);
  const database = cleanEnv(env.PGDATABASE) || cleanEnv(env.SQL_DB_NAME);
  const user = cleanEnv(env.PGUSER) || cleanEnv(env.SQL_USER);
  return Boolean(host && database && user);
}

export function resolveSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): SupabaseConnectionConfig | null {
  const url =
    cleanEnv(env.SUPABASE_URL) ||
    cleanEnv(env.NEXT_PUBLIC_SUPABASE_URL) ||
    cleanEnv(env.VITE_SUPABASE_URL);

  const serviceKey =
    cleanEnv(env.SUPABASE_SERVICE_ROLE_KEY) || cleanEnv(env.SUPABASE_SECRET_KEY);
  const fallbackKey =
    cleanEnv(env.SUPABASE_KEY) ||
    cleanEnv(env.SUPABASE_ANON_KEY) ||
    cleanEnv(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    cleanEnv(env.VITE_SUPABASE_ANON_KEY);

  const key = serviceKey || fallbackKey;
  if (!url || !key) return null;

  return {
    url,
    key,
    isServiceRole: Boolean(serviceKey),
  };
}

export function hasSupabaseConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveSupabaseConfig(env) !== null;
}

export function resolveDbConfig(env: NodeJS.ProcessEnv = process.env): ResolvedDbConfig {
  const hasPg = hasPostgresConfig(env);
  const hasSupa = hasSupabaseConfig(env);
  const requested = cleanEnv(env.DB_DRIVER).toLowerCase();

  let driver: DbDriver;
  if (requested === 'postgres' || requested === 'postgresql' || requested === 'pg') {
    driver = hasPg ? 'postgres' : hasSupa ? 'supabase' : 'json';
  } else if (requested === 'supabase') {
    driver = hasSupa ? 'supabase' : hasPg ? 'postgres' : 'json';
  } else if (requested === 'json' || requested === 'file') {
    driver = 'json';
  } else {
    driver = hasPg ? 'postgres' : hasSupa ? 'supabase' : 'json';
  }

  return {
    driver,
    hasPostgres: hasPg,
    hasSupabase: hasSupa,
  };
}

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h.startsWith('/') // Unix domain socket
  );
}

function resolveSslOption(
  hostOrUrl: string,
  env: NodeJS.ProcessEnv
): false | { rejectUnauthorized: boolean } {
  const pgSsl = cleanEnv(env.PGSSL).toLowerCase();
  if (pgSsl === 'false' || pgSsl === '0' || pgSsl === 'disable') {
    return false;
  }
  if (pgSsl === 'true' || pgSsl === '1' || pgSsl === 'require') {
    return { rejectUnauthorized: false };
  }

  if (hostOrUrl.includes('://')) {
    try {
      const parsed = new URL(hostOrUrl);
      const sslMode = parsed.searchParams.get('sslmode');
      if (sslMode === 'disable') return false;
      if (isLocalHost(parsed.hostname)) return false;
      return { rejectUnauthorized: false };
    } catch {
      return { rejectUnauthorized: false };
    }
  }

  if (!hostOrUrl || isLocalHost(hostOrUrl)) {
    return false;
  }
  return { rejectUnauthorized: false };
}

export function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const cleaned = cleanEnv(raw);
  if (!cleaned) return fallback;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return fallback;
  const int = Math.floor(num);
  if (int < min || int > max) return fallback;
  return int;
}

export function buildPgPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const connStr = getPostgresConnectionString(env);
  const max = parseBoundedInt(env.PG_POOL_MAX, 10, 1, 100);

  if (connStr) {
    return {
      connectionString: connStr,
      ssl: resolveSslOption(connStr, env),
      max,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    };
  }

  const host = cleanEnv(env.PGHOST) || cleanEnv(env.SQL_HOST) || '127.0.0.1';
  const port = parseBoundedInt(env.PGPORT || env.SQL_PORT, 5432, 1, 65535);
  const user = cleanEnv(env.PGUSER) || cleanEnv(env.SQL_USER) || 'postgres';
  const password = cleanEnv(env.PGPASSWORD) || cleanEnv(env.SQL_PASSWORD) || '';
  const database = cleanEnv(env.PGDATABASE) || cleanEnv(env.SQL_DB_NAME) || 'postgres';

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: resolveSslOption(host, env),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}
