/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Bidirectional row <-> domain mappers shared by PostgreSQL and Supabase backends.
 * Keeps full compatibility with the existing JSON data shape used by server.ts and client scripts.
 */

export interface CollectionSpec {
  table: string;
  columns: readonly string[];
  conflictTarget: string;
  orderBy?: string;
  toRow: (item: any) => Record<string, any>;
  fromRow: (row: Record<string, any>) => any;
}

export interface CatalogData {
  store: string;
  currency: string;
  currencySymbol: string;
  updatedAt: string;
  checkout: Record<string, any>;
  products: any[];
}

function toIsoOrNow(val: any): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function toIsoOrNull(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function parseJsonField<T>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

export const PRODUCT_COLUMNS = [
  'id',
  'slug',
  'channel',
  'name',
  'tag',
  'description',
  'stock',
  'sold',
  'best_seller',
  'featured',
  'key_based',
  'img',
  'plans',
  'features',
  'download_url',
  'tutorial_video',
  'unused_keys',
  'price_from',
  'updating',
  'status_mode',
  'update_note',
  'extra',
  'updated_at',
] as const;

export function productToRow(p: any): Record<string, any> {
  const id = String(p.id || p.slug);
  const slug = String(p.slug || p.id);
  const knownKeys = new Set([
    'id',
    'slug',
    'channel',
    'name',
    'tag',
    'desc',
    'description',
    'stock',
    'sold',
    'bestSeller',
    'featured',
    'key_based',
    'img',
    'plans',
    'features',
    'download_url',
    'tutorial_video',
    'unused_keys',
    'from',
    'updating',
    'status_mode',
    'update_note',
    'updatedAt',
  ]);
  const extra: Record<string, any> = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (!knownKeys.has(k) && v !== undefined) {
      extra[k] = v;
    }
  }

  return {
    id,
    slug,
    channel: p.channel || slug,
    name: String(p.name || slug),
    tag: String(p.tag || 'General'),
    description: String(p.desc ?? p.description ?? ''),
    stock: Number(p.stock) || 0,
    sold: Number(p.sold) || 0,
    best_seller: Boolean(p.bestSeller ?? p.best_seller),
    featured: Boolean(p.featured),
    key_based: p.key_based !== undefined ? Boolean(p.key_based) : true,
    img: String(p.img || '/assets/img/hero.jpg'),
    plans: Array.isArray(p.plans) ? p.plans : [],
    features: Array.isArray(p.features) ? p.features : [],
    download_url: String(p.download_url || ''),
    tutorial_video: String(p.tutorial_video || ''),
    unused_keys: Number(p.unused_keys) || 0,
    price_from: Number(p.from ?? p.price_from ?? 0) || 0,
    updating: Boolean(p.updating || p.status_mode === 'updating'),
    status_mode: p.updating || p.status_mode === 'updating' ? 'updating' : 'normal',
    update_note: String(p.update_note || ''),
    extra,
    updated_at: toIsoOrNow(p.updatedAt || p.updated_at),
  };
}

export function rowToProduct(row: Record<string, any>): any {
  const extra = parseJsonField<Record<string, any>>(row.extra, {});
  return {
    ...extra,
    id: row.id,
    slug: row.slug,
    channel: row.channel || row.slug,
    name: row.name,
    tag: row.tag || 'General',
    desc: row.description || '',
    stock: Number(row.stock) || 0,
    sold: Number(row.sold) || 0,
    bestSeller: Boolean(row.best_seller),
    featured: Boolean(row.featured),
    key_based: row.key_based !== undefined ? Boolean(row.key_based) : true,
    img: row.img || '/assets/img/hero.jpg',
    plans: parseJsonField<any[]>(row.plans, []),
    features: parseJsonField<any[]>(row.features, []),
    download_url: row.download_url || '',
    tutorial_video: row.tutorial_video || '',
    unused_keys: Number(row.unused_keys) || 0,
    from: Number(row.price_from) || 0,
    updating: Boolean(row.updating),
    status_mode: row.status_mode || (row.updating ? 'updating' : 'normal'),
    update_note: row.update_note || '',
    updatedAt: toIsoOrNow(row.updated_at),
  };
}

export const COLLECTION_SPECS: Record<string, CollectionSpec> = {
  'users.json': {
    table: 'users',
    columns: [
      'id',
      'username',
      'pass',
      'balance',
      'role',
      'firebase_uid',
      'email',
      'banned',
      'ban_reason',
      'created_at',
      'updated_at',
    ],
    conflictTarget: 'id',
    orderBy: 'created_at ASC',
    toRow: (u) => ({
      id: String(u.id),
      username: String(u.username),
      pass: String(u.pass || ''),
      balance: Number(u.balance) || 0,
      role: String(u.role || 'user'),
      firebase_uid: u.firebaseUid ?? u.firebase_uid ?? null,
      email: u.email ?? null,
      banned: Boolean(u.banned),
      ban_reason: u.ban_reason ?? null,
      created_at: toIsoOrNow(u.createdAt || u.created_at),
      updated_at: toIsoOrNow(u.updatedAt || u.updated_at || u.createdAt),
    }),
    fromRow: (r) => {
      const obj: Record<string, any> = {
        id: r.id,
        username: r.username,
        pass: r.pass || '',
        balance: Number(r.balance) || 0,
        role: r.role || 'user',
        banned: Boolean(r.banned),
        ban_reason: r.ban_reason ?? null,
        createdAt: toIsoOrNow(r.created_at),
        updatedAt: toIsoOrNow(r.updated_at),
      };
      if (r.firebase_uid) obj.firebaseUid = r.firebase_uid;
      if (r.email) obj.email = r.email;
      return obj;
    },
  },

  'sessions.json': {
    table: 'sessions',
    columns: ['id', 'token_hash', 'uid', 'exp'],
    conflictTarget: 'id',
    toRow: (s) => ({
      id: String(s.id),
      token_hash: String(s.h || s.token_hash),
      uid: String(s.uid),
      exp: Number(s.exp) || 0,
    }),
    fromRow: (r) => ({
      id: r.id,
      h: r.token_hash,
      uid: r.uid,
      exp: Number(r.exp) || 0,
    }),
  },

  'keys.json': {
    table: 'product_keys',
    columns: ['id', 'product_id', 'plan_label', 'key_value', 'is_used', 'order_id', 'used_at', 'created_at'],
    conflictTarget: 'id',
    orderBy: 'created_at ASC',
    toRow: (k) => ({
      id: String(k.id),
      product_id: String(k.product_id),
      plan_label: k.plan_label ?? null,
      key_value: String(k.key_value),
      is_used: Boolean(k.is_used),
      order_id: k.order_id ?? null,
      used_at: toIsoOrNull(k.used_at),
      created_at: toIsoOrNow(k.created_at),
    }),
    fromRow: (r) => ({
      id: r.id,
      product_id: r.product_id,
      plan_label: r.plan_label ?? null,
      key_value: r.key_value,
      is_used: Boolean(r.is_used),
      order_id: r.order_id ?? null,
      used_at: toIsoOrNull(r.used_at),
      created_at: toIsoOrNow(r.created_at),
    }),
  },

  'orders.json': {
    table: 'orders',
    columns: [
      'id',
      'status',
      'user_id',
      'product',
      'plan',
      'unit_price',
      'quantity',
      'total',
      'currency',
      'contact',
      'keys_delivered',
      'download_url',
      'created_at',
      'paid_at',
    ],
    conflictTarget: 'id',
    orderBy: 'created_at ASC',
    toRow: (o) => ({
      id: String(o.id),
      status: String(o.status || 'pending'),
      user_id: String(o.userId || o.user_id || ''),
      product: o.product || {},
      plan: o.plan || {},
      unit_price: Number(o.unitPrice ?? o.unit_price ?? 0) || 0,
      quantity: Number(o.quantity) || 1,
      total: Number(o.total) || 0,
      currency: String(o.currency || '฿'),
      contact: o.contact ?? null,
      keys_delivered: Array.isArray(o.keys_delivered) ? o.keys_delivered : [],
      download_url: o.download_url ?? null,
      created_at: toIsoOrNow(o.createdAt || o.created_at),
      paid_at: toIsoOrNull(o.paidAt || o.paid_at),
    }),
    fromRow: (r) => ({
      id: r.id,
      status: r.status,
      userId: r.user_id,
      product: parseJsonField<Record<string, any>>(r.product, {}),
      plan: parseJsonField<Record<string, any>>(r.plan, {}),
      unitPrice: Number(r.unit_price) || 0,
      quantity: Number(r.quantity) || 1,
      total: Number(r.total) || 0,
      currency: r.currency || '฿',
      contact: r.contact ?? null,
      keys_delivered: parseJsonField<string[]>(r.keys_delivered, []),
      download_url: r.download_url ?? null,
      createdAt: toIsoOrNow(r.created_at),
      paidAt: toIsoOrNull(r.paid_at),
    }),
  },

  'topups.json': {
    table: 'topups',
    columns: ['id', 'uid', 'method', 'amount', 'voucher', 'status', 'extra', 'created_at'],
    conflictTarget: 'id',
    orderBy: 'created_at ASC',
    toRow: (t) => {
      const { id, uid, method, amount, voucher, status, createdAt, created_at, ...rest } = t || {};
      return {
        id: String(id),
        uid: String(uid || ''),
        method: String(method || 'unknown'),
        amount: Number(amount) || 0,
        voucher: voucher ?? null,
        status: String(status || 'pending'),
        extra: rest,
        created_at: toIsoOrNow(createdAt || created_at),
      };
    },
    fromRow: (r) => {
      const extra = parseJsonField<Record<string, any>>(r.extra, {});
      return {
        ...extra,
        id: r.id,
        uid: r.uid,
        method: r.method,
        amount: Number(r.amount) || 0,
        voucher: r.voucher ?? undefined,
        status: r.status,
        createdAt: toIsoOrNow(r.created_at),
      };
    },
  },

  'manual_topups.json': {
    table: 'manual_topups',
    columns: [
      'id',
      'user_id',
      'username',
      'channel_id',
      'channel_name',
      'amount',
      'slip_url',
      'qr_payload',
      'status',
      'admin_note',
      'created_at',
    ],
    conflictTarget: 'id',
    orderBy: 'created_at ASC',
    toRow: (t) => ({
      id: String(t.id),
      user_id: String(t.user_id || ''),
      username: String(t.username || ''),
      channel_id: String(t.channel_id || 'kbank'),
      channel_name: String(t.channel_name || ''),
      amount: Number(t.amount) || 0,
      slip_url: t.slip_url ?? null,
      qr_payload: t.qr_payload ?? null,
      status: String(t.status || 'pending'),
      admin_note: t.admin_note ?? null,
      created_at: toIsoOrNow(t.created_at),
    }),
    fromRow: (r) => {
      const obj: Record<string, any> = {
        id: r.id,
        user_id: r.user_id,
        username: r.username,
        channel_id: r.channel_id,
        channel_name: r.channel_name,
        amount: Number(r.amount) || 0,
        slip_url: r.slip_url ?? null,
        qr_payload: r.qr_payload ?? null,
        status: r.status,
        created_at: toIsoOrNow(r.created_at),
      };
      if (r.admin_note) obj.admin_note = r.admin_note;
      return obj;
    },
  },

  'coupons.json': {
    table: 'coupons',
    columns: ['id', 'code', 'amount', 'max_uses', 'used_count', 'per_user_limit', 'note', 'enabled', 'created_at'],
    conflictTarget: 'id',
    orderBy: 'created_at ASC',
    toRow: (c) => ({
      id: String(c.id),
      code: String(c.code || '').toUpperCase(),
      amount: Number(c.amount) || 0,
      max_uses: c.max_uses != null ? Number(c.max_uses) : null,
      used_count: Number(c.used_count) || 0,
      per_user_limit: c.per_user_limit != null ? Number(c.per_user_limit) : 1,
      note: String(c.note || ''),
      enabled: c.enabled !== undefined ? Boolean(c.enabled) : true,
      created_at: toIsoOrNow(c.created_at),
    }),
    fromRow: (r) => ({
      id: r.id,
      code: r.code,
      amount: Number(r.amount) || 0,
      max_uses: r.max_uses != null ? Number(r.max_uses) : null,
      used_count: Number(r.used_count) || 0,
      per_user_limit: Number(r.per_user_limit) || 1,
      note: r.note || '',
      enabled: Boolean(r.enabled),
      created_at: toIsoOrNow(r.created_at),
    }),
  },

  'coupon_uses.json': {
    table: 'coupon_uses',
    columns: ['id', 'coupon_id', 'code', 'user_id', 'amount', 'used_at'],
    conflictTarget: 'id',
    orderBy: 'used_at ASC',
    toRow: (u) => ({
      id: String(u.id),
      coupon_id: String(u.coupon_id),
      code: String(u.code),
      user_id: String(u.user_id),
      amount: Number(u.amount) || 0,
      used_at: toIsoOrNow(u.used_at),
    }),
    fromRow: (r) => ({
      id: r.id,
      coupon_id: r.coupon_id,
      code: r.code,
      user_id: r.user_id,
      amount: Number(r.amount) || 0,
      used_at: toIsoOrNow(r.used_at),
    }),
  },

  'news.json': {
    table: 'news',
    columns: ['id', 'title', 'body', 'badge', 'is_pinned', 'image_url', 'published', 'created_at', 'updated_at'],
    conflictTarget: 'id',
    orderBy: 'created_at ASC',
    toRow: (n) => ({
      id: String(n.id),
      title: String(n.title || ''),
      body: String(n.body ?? n.content ?? ''),
      badge: String(n.badge || 'ประกาศ'),
      is_pinned: Boolean(n.is_pinned),
      image_url: String(n.image_url || ''),
      published: n.published !== undefined ? Boolean(n.published) : true,
      created_at: toIsoOrNow(n.created_at),
      updated_at: toIsoOrNow(n.updated_at || n.created_at),
    }),
    fromRow: (r) => ({
      id: r.id,
      title: r.title,
      body: r.body || '',
      content: r.body || '',
      badge: r.badge || 'ประกาศ',
      is_pinned: Boolean(r.is_pinned),
      image_url: r.image_url || '',
      published: r.published !== undefined ? Boolean(r.published) : true,
      created_at: toIsoOrNow(r.created_at),
      updated_at: toIsoOrNow(r.updated_at),
    }),
  },

  'payment_channels.json': {
    table: 'payment_channels',
    columns: ['id', 'name', 'type', 'bank_name', 'account_no', 'account_name', 'qr', 'enabled', 'sort_order', 'created_at'],
    conflictTarget: 'id',
    orderBy: 'sort_order ASC, created_at ASC',
    toRow: (c) => ({
      id: String(c.id),
      name: String(c.name || ''),
      type: String(c.type || 'bank'),
      bank_name: String(c.bank_name || ''),
      account_no: String(c.account_no || ''),
      account_name: String(c.account_name || ''),
      qr: String(c.qr ?? c.qr_img ?? ''),
      enabled: c.enabled !== undefined ? Boolean(c.enabled) : true,
      sort_order: Number(c.sort_order) || 0,
      created_at: toIsoOrNow(c.created_at),
    }),
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      type: r.type || 'bank',
      bank_name: r.bank_name || '',
      account_no: r.account_no || '',
      account_name: r.account_name || '',
      qr: r.qr || '',
      qr_img: r.qr || '',
      enabled: Boolean(r.enabled),
      sort_order: Number(r.sort_order) || 0,
      created_at: toIsoOrNow(r.created_at),
    }),
  },

  'support_links.json': {
    table: 'support_links',
    columns: ['id', 'platform', 'label', 'handle', 'badge', 'url', 'description', 'icon', 'enabled', 'sort_order', 'created_at'],
    conflictTarget: 'id',
    orderBy: 'sort_order ASC, created_at ASC',
    toRow: (l) => ({
      id: String(l.id || `sup_${Date.now().toString(36)}`),
      platform: String(l.platform || ''),
      label: String(l.label || ''),
      handle: String(l.handle || ''),
      badge: String(l.badge || ''),
      url: String(l.url || ''),
      description: String(l.description || ''),
      icon: String(l.icon || l.platform || ''),
      enabled: l.enabled !== undefined ? Boolean(l.enabled) : true,
      sort_order: Number(l.sort_order) || 0,
      created_at: toIsoOrNow(l.created_at),
    }),
    fromRow: (r) => ({
      id: r.id,
      platform: r.platform || '',
      label: r.label,
      handle: r.handle || '',
      badge: r.badge || '',
      url: r.url,
      description: r.description || '',
      icon: r.icon || r.platform || '',
      enabled: Boolean(r.enabled),
      sort_order: Number(r.sort_order) || 0,
      created_at: toIsoOrNow(r.created_at),
    }),
  },
};

export function normalizeCatalogPayload(data: any): CatalogData {
  if (Array.isArray(data)) {
    return {
      store: 'XENARY',
      currency: 'THB',
      currencySymbol: '฿',
      updatedAt: new Date().toISOString().slice(0, 10),
      checkout: { ticket: '/contact/' },
      products: data,
    };
  }
  return {
    store: data?.store || 'XENARY',
    currency: data?.currency || 'THB',
    currencySymbol: data?.currencySymbol || '฿',
    updatedAt: data?.updatedAt || new Date().toISOString().slice(0, 10),
    checkout: data?.checkout || { ticket: '/contact/' },
    products: Array.isArray(data?.products) ? data.products : [],
  };
}

export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) {
    out.push(items.slice(i, i + step));
  }
  return out;
}

export function buildMultiRowUpsertQuery(options: {
  table: string;
  columns: readonly string[];
  conflictTarget: string;
  rows: Record<string, any>[];
  jsonbColumns: ReadonlySet<string>;
  doNothing?: boolean;
}): { sql: string; values: any[] } {
  const { table, columns, conflictTarget, rows, jsonbColumns, doNothing = false } = options;
  const values: any[] = [];
  const tupleSqlList: string[] = [];

  for (const row of rows) {
    const placeholders: string[] = [];
    for (const col of columns) {
      const rawVal = row[col];
      let serialized: any;
      if (rawVal === undefined) {
        serialized = null;
      } else if (jsonbColumns.has(col)) {
        serialized = rawVal === null ? null : JSON.stringify(rawVal);
      } else {
        serialized = rawVal;
      }
      values.push(serialized);
      const paramIdx = values.length;
      placeholders.push(jsonbColumns.has(col) ? `$${paramIdx}::jsonb` : `$${paramIdx}`);
    }
    tupleSqlList.push(`(${placeholders.join(', ')})`);
  }

  const updateColumns = columns.filter((c) => c !== conflictTarget);
  const conflictClause =
    doNothing || updateColumns.length === 0
      ? `ON CONFLICT (${conflictTarget}) DO NOTHING`
      : `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateColumns
          .map((c) => `${c} = EXCLUDED.${c}`)
          .join(', ')}`;

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tupleSqlList.join(', ')} ${conflictClause}`;
  return { sql, values };
}
