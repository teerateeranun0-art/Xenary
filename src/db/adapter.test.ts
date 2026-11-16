import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildPgPoolConfig,
  resolveDbConfig,
  resolveSupabaseConfig,
} from './config';
import {
  COLLECTION_SPECS,
  normalizeCatalogPayload,
  productToRow,
  rowToProduct,
} from './mappers';
import { createStoreAdapter } from './adapter';

test('resolveDbConfig selects driver based on DB_DRIVER and available credentials', () => {
  assert.deepEqual(resolveDbConfig({}), {
    driver: 'json',
    hasPostgres: false,
    hasSupabase: false,
  });

  assert.equal(
    resolveDbConfig({ DATABASE_URL: 'postgresql://user:pw@db.example.com:5432/postgres' }).driver,
    'postgres'
  );

  assert.equal(
    resolveDbConfig({
      PGHOST: '127.0.0.1',
      PGDATABASE: 'xenary',
      PGUSER: 'postgres',
    }).driver,
    'postgres'
  );

  assert.equal(
    resolveDbConfig({
      SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    }).driver,
    'supabase'
  );

  const bothEnv = {
    DATABASE_URL: 'postgresql://user:pw@db.example.com:5432/postgres',
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
  };

  assert.equal(resolveDbConfig({ ...bothEnv, DB_DRIVER: 'supabase' }).driver, 'supabase');
  assert.equal(resolveDbConfig({ ...bothEnv, DB_DRIVER: 'postgres' }).driver, 'postgres');
  assert.equal(resolveDbConfig({ ...bothEnv, DB_DRIVER: 'json' }).driver, 'json');
});

test('resolveSupabaseConfig prioritizes service role key cleanly', () => {
  const cfg = resolveSupabaseConfig({
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  });
  assert.deepEqual(cfg, {
    url: 'https://proj.supabase.co',
    key: 'service-role-key',
    isServiceRole: true,
  });

  const anonOnly = resolveSupabaseConfig({
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  });
  assert.deepEqual(anonOnly, {
    url: 'https://proj.supabase.co',
    key: 'anon-key',
    isServiceRole: false,
  });
});

test('buildPgPoolConfig configures local vs remote SSL appropriately', () => {
  const localUrlCfg = buildPgPoolConfig({
    DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/xenary',
  });
  assert.equal(localUrlCfg.ssl, false);

  const remoteUrlCfg = buildPgPoolConfig({
    DATABASE_URL: 'postgresql://postgres:pw@db.xyz.supabase.co:5432/postgres',
  });
  assert.deepEqual(remoteUrlCfg.ssl, { rejectUnauthorized: false });

  const discreteCfg = buildPgPoolConfig({
    PGHOST: '10.0.0.5',
    PGPORT: '5433',
    PGUSER: 'xenary',
    PGPASSWORD: 'secret',
    PGDATABASE: 'store',
  });
  assert.equal(discreteCfg.host, '10.0.0.5');
  assert.equal(discreteCfg.port, 5433);
  assert.deepEqual(discreteCfg.ssl, { rejectUnauthorized: false });

  const disabledSsl = buildPgPoolConfig({
    PGHOST: '10.0.0.5',
    PGUSER: 'xenary',
    PGDATABASE: 'store',
    PGSSL: 'false',
  });
  assert.equal(disabledSsl.ssl, false);
});

test('row mappers preserve types and normalize PostgreSQL numeric/bigint strings', () => {
  const sampleProduct = {
    id: 'aim-color',
    slug: 'aim-color',
    name: 'VAL AIM COLOR',
    tag: 'Valorant',
    desc: 'Test desc',
    stock: 4,
    sold: 12,
    bestSeller: true,
    featured: true,
    plans: [{ label: '1 วัน', price: 59, per: '/1 วัน' }],
    from: 59,
    updating: false,
    customMeta: 'kept',
  };
  const pRow = productToRow(sampleProduct);
  const pOut = rowToProduct({
    ...pRow,
    price_from: '59.00',
    plans: JSON.stringify(pRow.plans),
    extra: JSON.stringify(pRow.extra),
  });
  assert.equal(pOut.slug, 'aim-color');
  assert.equal(pOut.from, 59);
  assert.equal(pOut.bestSeller, true);
  assert.equal(pOut.plans[0].price, 59);
  assert.equal(pOut.customMeta, 'kept');

  const userSpec = COLLECTION_SPECS['users.json'];
  const uRow = userSpec.toRow({
    id: 'U1',
    username: 'tester',
    pass: 'hash',
    balance: 150.75,
    role: 'admin',
    firebaseUid: 'fb-123',
    email: 'tester@example.com',
  });
  const uOut = userSpec.fromRow({ ...uRow, balance: '150.75' });
  assert.equal(uOut.balance, 150.75);
  assert.equal(typeof uOut.balance, 'number');
  assert.equal(uOut.firebaseUid, 'fb-123');
  assert.equal(uOut.email, 'tester@example.com');

  const sessSpec = COLLECTION_SPECS['sessions.json'];
  const sRow = sessSpec.toRow({ id: 'S1', h: 'tokhash', uid: 'U1', exp: 1790000000000 });
  const sOut = sessSpec.fromRow({ ...sRow, exp: '1790000000000' });
  assert.equal(sOut.h, 'tokhash');
  assert.equal(sOut.exp, 1790000000000);
  assert.equal(typeof sOut.exp, 'number');
});

test('UnifiedStore JSON fallback supports atomic read/write and catalog helpers', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xenary-db-test-'));
  try {
    const store = createStoreAdapter({
      rootDir: process.cwd(),
      dataDir: tmpDir,
      env: { DB_DRIVER: 'json' },
    });

    assert.equal(store.driver, 'json');
    await store.writeCollection('users.json', [
      { id: 'U1', username: 'alice', pass: 'x', balance: 250, role: 'user', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    const users = await store.readCollection<any[]>('users.json', []);
    assert.equal(users.length, 1);
    assert.equal(users[0].balance, 250);

    await store.saveProductsList([{ id: 'p1', slug: 'p1', name: 'Prod 1', plans: [{ label: '1D', price: 99 }] }]);
    const cat = await store.getCatalogData();
    assert.equal(cat.products.length, 1);
    assert.equal(cat.products[0].name, 'Prod 1');

    const order: number[] = [];
    await Promise.all([
      store.withLock('test-lock', async () => {
        await new Promise((r) => setTimeout(r, 15));
        order.push(1);
      }),
      store.withLock('test-lock', async () => {
        order.push(2);
      }),
    ]);
    assert.deepEqual(order, [1, 2]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('supabase/schema.sql defines all 13 tables and enables RLS', () => {
  const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const expectedTables = [
    'users',
    'sessions',
    'products',
    'product_keys',
    'orders',
    'topups',
    'manual_topups',
    'coupons',
    'coupon_uses',
    'news',
    'payment_channels',
    'support_links',
    'store_settings',
  ];
  for (const tbl of expectedTables) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`),
      `Expected CREATE TABLE IF NOT EXISTS ${tbl}`
    );
    assert.ok(
      sql.includes(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY`),
      `Expected RLS enabled on ${tbl}`
    );
  }
  assert.equal(normalizeCatalogPayload([]).store, 'XENARY');
});
