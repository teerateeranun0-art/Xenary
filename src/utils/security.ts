/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Core security and financial precision library for XENARY Store.
 * Direct TypeScript port of the verified Rust engine (`crates/xenary_rust/src/lib.rs`).
 */

import crypto from 'node:crypto';
import path from 'node:path';

// ============================================================================
// 1. FINANCIAL PRECISION: Integer Satang Calculations (No Float Rounding Bugs)
// ============================================================================

export class Satang {
  static readonly ZERO = new Satang(0);
  static readonly MAX_ALLOWED = new Satang(1_000_000_000_000_00); // 10,000,000,000.00 THB max limit (1 trillion satangs)

  constructor(public readonly amountSatangs: number) {
    if (!Number.isSafeInteger(amountSatangs) || amountSatangs < 0) {
      throw new Error(`Invalid satangs: ${amountSatangs}`);
    }
  }

  static fromThb(thb: number): Satang {
    if (!Number.isFinite(thb) || thb < 0) {
      throw new Error('invalid_negative_or_nan_amount');
    }
    const satangs = Math.round(thb * 100);
    if (satangs > Satang.MAX_ALLOWED.amountSatangs) {
      throw new Error('amount_exceeds_maximum_threshold');
    }
    return new Satang(satangs);
  }

  toThb(): number {
    return this.amountSatangs / 100;
  }

  checkedAdd(other: Satang): Satang | null {
    const val = this.amountSatangs + other.amountSatangs;
    if (val <= Satang.MAX_ALLOWED.amountSatangs) {
      return new Satang(val);
    }
    return null;
  }

  checkedSub(other: Satang): Satang | null {
    const val = this.amountSatangs - other.amountSatangs;
    if (val >= 0) {
      return new Satang(val);
    }
    return null;
  }

  checkedMulQty(qty: number): Satang | null {
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) return null;
    const val = this.amountSatangs * qty;
    if (val <= Satang.MAX_ALLOWED.amountSatangs) {
      return new Satang(val);
    }
    return null;
  }
}

// ============================================================================
// 2. SECURITY: Constant-Time Comparison, Path Shield, HTML Escaping
// ============================================================================

export function timingSafeStrEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function escapeHtml(input: string): string {
  return String(input ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

export function validateUsername(username: string): boolean {
  if (!username || username.length < 3 || username.length > 20) return false;
  return /^[a-zA-Z0-9_]+$/.test(username);
}

export function isSafePublicPath(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false;
  let decoded = targetPath;
  try {
    decoded = decodeURIComponent(targetPath);
  } catch {}

  if (
    decoded.includes('..') ||
    decoded.includes('\0') ||
    decoded.includes('\\') ||
    targetPath.includes('..') ||
    targetPath.includes('\0') ||
    targetPath.includes('\\')
  ) {
    return false;
  }

  const normalized = path.posix.normalize(decoded).toLowerCase();
  const blockedPrefixes = [
    '/node_modules', '/.git', '/.env', '/package.json', '/package-lock.json',
    '/src/server', '/src/data', '/src/utils', '/src/lib', '/src/db', '/supabase', '/scripts',
    '/crates', '/server.ts', '/firestore.rules', '/eslint.config.mjs',
    '/firebase-applet-config.json', '/firebase-blueprint.json', '/security_spec.md'
  ];
  for (const prefix of blockedPrefixes) {
    if (normalized === prefix || normalized.startsWith(prefix + '/') || normalized.startsWith(prefix)) {
      return false;
    }
  }

  const blockedExtensions = ['.json', '.sql', '.md', '.env', '.yml', '.yaml', '.sh', '.toml', '.rs', '.ts', '.tsx', '.rules', '.mjs'];
  for (const ext of blockedExtensions) {
    if (normalized.endsWith(ext)) return false;
  }
  return true;
}

// ============================================================================
// 3. PROMPTPAY EMVCo CRC-16
// ============================================================================

export function promptpayCrc16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generatePromptpayPayload(phoneOrId: string, amountSatangs?: Satang | null): string {
  const digits = String(phoneOrId || '').replace(/\D/g, '');
  const sanitizedId = digits.length < 9 ? '0812345678' : digits;

  const target = sanitizedId.length >= 13
    ? `0213${sanitizedId.slice(0, 13)}`
    : (() => {
        const trimmed = sanitizedId.replace(/^0/, '');
        const international = `0066${trimmed.slice(0, 9)}`;
        return `01${String(international.length).padStart(2, '0')}${international}`;
      })();

  const merchantPayload = `0016A000000677010111${target}`;
  const merchantTag = `29${String(merchantPayload.length).padStart(2, '0')}${merchantPayload}`;

  let body = '000201';
  if (amountSatangs && amountSatangs.amountSatangs > 0) {
    body += '010212'; // Dynamic
    body += merchantTag;
    body += '5303764'; // THB
    const amtStr = amountSatangs.toThb().toFixed(2);
    body += `54${String(amtStr.length).padStart(2, '0')}${amtStr}`;
  } else {
    body += '010211'; // Static
    body += merchantTag;
    body += '5303764';
  }

  body += '5802TH';
  body += '6304';

  const crc = promptpayCrc16(body);
  return body + crc;
}

// ============================================================================
// 4. URL, SLUG, & PAYLOAD SANITIZATION + PURE ADMIN ANALYTICS/FILTER HELPERS
// ============================================================================

export function isSafeHttpUrl(
  rawUrl: string,
  options: { allowRelative?: boolean; allowMailTel?: boolean } = {}
): boolean {
  const { allowRelative = true, allowMailTel = false } = options;
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;

  if (allowRelative && trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }

  if (allowMailTel) {
    if (/^mailto:[^\s<>"{}|\\^`]+@[^\s<>"{}|\\^`]+\.[^\s<>"{}|\\^`]+$/i.test(trimmed)) {
      return true;
    }
    if (/^tel:[0-9+*#-]{3,24}$/i.test(trimmed)) {
      return true;
    }
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafeSlipUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed.length <= 8 * 1024 * 1024;
  }
  return isSafeHttpUrl(trimmed, { allowRelative: true, allowMailTel: false });
}

export function isValidProductSlug(slug: string): boolean {
  if (typeof slug !== 'string') return false;
  return /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(slug.trim());
}

export interface SanitizedPlan {
  label: string;
  price: number;
  per: string;
}

export function sanitizePlans(rawPlans: unknown): SanitizedPlan[] {
  if (!Array.isArray(rawPlans)) return [];
  const out: SanitizedPlan[] = [];
  for (const item of rawPlans) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const label = String(raw.label ?? '').trim().slice(0, 64);
    const numPrice = Number(raw.price);
    if (!label || !Number.isFinite(numPrice) || numPrice <= 0) continue;
    try {
      const priceSatang = Satang.fromThb(numPrice);
      if (priceSatang.amountSatangs <= 0) continue;
      const per = typeof raw.per === 'string' && raw.per.trim() ? raw.per.trim().slice(0, 32) : `/${label}`;
      out.push({ label, price: priceSatang.toThb(), per });
    } catch {
      continue;
    }
  }
  return out;
}

export function filterAndEnrichKeys(
  keys: any[],
  products: any[],
  query: {
    product_id?: string;
    plan_label?: string;
    status?: string;
    q?: string;
  } = {}
): any[] {
  const prodIdFilter = String(query.product_id || '').trim();
  const planFilter = String(query.plan_label || '').trim();
  const statusFilter = String(query.status || 'all').trim().toLowerCase();
  const q = String(query.q || '').trim().toLowerCase();

  const prodById = new Map<string, any>();
  for (const p of products || []) {
    if (p?.slug) prodById.set(String(p.slug), p);
    if (p?.id) prodById.set(String(p.id), p);
  }

  return (keys || [])
    .filter((k) => {
      if (prodIdFilter) {
        const matchedProd = prodById.get(prodIdFilter);
        const targetIds = matchedProd
          ? new Set([String(matchedProd.slug || ''), String(matchedProd.id || '')].filter(Boolean))
          : new Set([prodIdFilter]);
        if (!targetIds.has(String(k.product_id || ''))) return false;
      }
      if (planFilter === '__any__') {
        if (k.plan_label) return false;
      } else if (planFilter) {
        if (String(k.plan_label || '').toLowerCase() !== planFilter.toLowerCase()) return false;
      }
      if (statusFilter === 'unused' && k.is_used) return false;
      if (statusFilter === 'used' && !k.is_used) return false;
      if (q) {
        const hay = `${k.key_value || ''} ${k.product_id || ''} ${k.plan_label || ''} ${k.order_id || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .reverse()
    .slice(0, 500)
    .map((k) => {
      const p = prodById.get(String(k.product_id || ''));
      return {
        ...k,
        product_name: p?.name || k.product_name || k.product_id,
        product_tag: p?.tag || k.product_tag || 'General',
        product_img: p?.img || k.product_img || '',
      };
    });
}

export function computeAdminStats(
  orders: any[],
  users: any[],
  topups: any[],
  manualTopups: any[],
  keys: any[],
  products: any[],
  now: Date = new Date()
) {
  const paidStatuses = new Set(['paid', 'delivered', 'completed']);
  const bangkokNow = new Date(now.getTime() + 7 * 3600 * 1000);
  const todayStr = bangkokNow.toISOString().slice(0, 10);
  const monthStr = bangkokNow.toISOString().slice(0, 7);

  let revTotalSatangs = 0;
  let revTodaySatangs = 0;
  let revMonthSatangs = 0;
  let paidCount = 0;

  for (const o of orders || []) {
    if (!paidStatuses.has(String(o?.status || '').toLowerCase())) continue;
    paidCount += 1;
    let orderSatang = 0;
    try {
      orderSatang = Satang.fromThb(Number(o.total) || 0).amountSatangs;
    } catch {
      orderSatang = 0;
    }
    revTotalSatangs += orderSatang;

    const ts = o.paidAt || o.createdAt || o.created_at;
    if (ts) {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) {
        const bkk = new Date(d.getTime() + 7 * 3600 * 1000).toISOString();
        if (bkk.slice(0, 10) === todayStr) revTodaySatangs += orderSatang;
        if (bkk.slice(0, 7) === monthStr) revMonthSatangs += orderSatang;
      }
    }
  }

  const pendingCount =
    (topups || []).filter((t) => t.status === 'pending' || t.status === 'processing').length +
    (manualTopups || []).filter((t) => t.status === 'pending').length;

  return {
    revenue_today: revTodaySatangs / 100,
    revenue_month: revMonthSatangs / 100,
    revenue_total: revTotalSatangs / 100,
    paid_orders_count: paidCount,
    total_users: (users || []).length,
    pending_topups_count: pendingCount,
    unused_keys_count: (keys || []).filter((k) => !k.is_used).length,
    products_count: (products || []).length,
  };
}

