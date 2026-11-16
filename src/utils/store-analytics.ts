/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure business logic for XENARY Store:
 * - Discount & gift coupon evaluation (Satang integer math)
 * - Public store KPI & live feed aggregator
 * - Extended Admin analytics (7d / 30d / 12m series, category share, 24h distribution, channels)
 */

import { Satang } from './security';

export interface CouponRecord {
  id: string;
  code: string;
  coupon_type?: 'credit' | 'discount';
  discount_type?: 'percent' | 'fixed';
  amount: number;
  min_spend?: number | null;
  max_uses?: number | null;
  per_user_limit?: number | null;
  used_count?: number;
  expires_at?: string | null;
  enabled?: boolean;
  note?: string;
}

export interface DiscountEvalResult {
  valid: boolean;
  reason?: string;
  message: string;
  discountSatang: number;
  discountThb: number;
  originalTotalThb: number;
  finalTotalSatang: number;
  finalTotalThb: number;
  coupon?: {
    id: string;
    code: string;
    discount_type: 'percent' | 'fixed';
    amount: number;
    min_spend: number;
  };
}

export function maskBuyerName(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s) return 'US****';
  if (s.length <= 2) return s[0] + '****';
  return s.slice(0, 3) + '****';
}

export function evaluateDiscountCoupon(params: {
  coupon: CouponRecord | undefined | null;
  subtotalSatang: Satang;
  usedByUserCount?: number;
  now?: Date;
}): DiscountEvalResult {
  const { coupon, subtotalSatang, usedByUserCount = 0, now = new Date() } = params;
  const origThb = subtotalSatang.toThb();

  if (!coupon || coupon.enabled === false) {
    return {
      valid: false,
      reason: 'not_found',
      message: 'ไม่พบรหัสส่วนลดนี้หรือถูกปิดใช้งานแล้ว',
      discountSatang: 0,
      discountThb: 0,
      originalTotalThb: origThb,
      finalTotalSatang: subtotalSatang.amountSatangs,
      finalTotalThb: origThb,
    };
  }

  const couponType = coupon.coupon_type === 'discount' || coupon.discount_type ? 'discount' : 'credit';
  if (couponType !== 'discount') {
    return {
      valid: false,
      reason: 'not_discount_coupon',
      message: 'โค้ดนี้เป็นโค้ดเติมเครดิต กรุณานำไปแลกที่หน้าเติมเงิน',
      discountSatang: 0,
      discountThb: 0,
      originalTotalThb: origThb,
      finalTotalSatang: subtotalSatang.amountSatangs,
      finalTotalThb: origThb,
    };
  }

  if (coupon.expires_at) {
    const exp = new Date(coupon.expires_at);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < now.getTime()) {
      return {
        valid: false,
        reason: 'expired',
        message: 'รหัสส่วนลดนี้หมดอายุแล้ว',
        discountSatang: 0,
        discountThb: 0,
        originalTotalThb: origThb,
        finalTotalSatang: subtotalSatang.amountSatangs,
        finalTotalThb: origThb,
      };
    }
  }

  if (coupon.max_uses != null && (Number(coupon.used_count) || 0) >= Number(coupon.max_uses)) {
    return {
      valid: false,
      reason: 'exhausted',
      message: 'รหัสส่วนลดนี้ถูกใช้งานครบจำนวนสิทธิ์แล้ว',
      discountSatang: 0,
      discountThb: 0,
      originalTotalThb: origThb,
      finalTotalSatang: subtotalSatang.amountSatangs,
      finalTotalThb: origThb,
    };
  }

  const perUserLimit = Number(coupon.per_user_limit) || 1;
  if (usedByUserCount >= perUserLimit) {
    return {
      valid: false,
      reason: 'already_used',
      message: 'คุณใช้สิทธิ์รหัสส่วนลดนี้ครบแล้ว',
      discountSatang: 0,
      discountThb: 0,
      originalTotalThb: origThb,
      finalTotalSatang: subtotalSatang.amountSatangs,
      finalTotalThb: origThb,
    };
  }

  const minSpendThb = Math.max(0, Number(coupon.min_spend) || 0);
  if (minSpendThb > 0) {
    const minSpendSat = Satang.fromThb(minSpendThb);
    if (subtotalSatang.amountSatangs < minSpendSat.amountSatangs) {
      return {
        valid: false,
        reason: 'min_spend_not_met',
        message: `ยอดสั่งซื้อขั้นต่ำต้องไม่น้อยกว่า ฿${minSpendThb.toLocaleString('en-US')}`,
        discountSatang: 0,
        discountThb: 0,
        originalTotalThb: origThb,
        finalTotalSatang: subtotalSatang.amountSatangs,
        finalTotalThb: origThb,
      };
    }
  }

  const dType: 'percent' | 'fixed' = coupon.discount_type === 'percent' ? 'percent' : 'fixed';
  const rawAmt = Number(coupon.amount) || 0;
  if (rawAmt <= 0) {
    return {
      valid: false,
      reason: 'invalid_discount',
      message: 'มูลค่าส่วนลดไม่ถูกต้อง',
      discountSatang: 0,
      discountThb: 0,
      originalTotalThb: origThb,
      finalTotalSatang: subtotalSatang.amountSatangs,
      finalTotalThb: origThb,
    };
  }

  let discountSat = 0;
  if (dType === 'percent') {
    const clampedPct = Math.min(100, Math.max(0, rawAmt));
    discountSat = Math.floor((subtotalSatang.amountSatangs * clampedPct) / 100);
  } else {
    discountSat = Satang.fromThb(rawAmt).amountSatangs;
  }

  // Cap discount at subtotal so total cannot go negative
  if (discountSat > subtotalSatang.amountSatangs) {
    discountSat = subtotalSatang.amountSatangs;
  }

  const finalSat = subtotalSatang.amountSatangs - discountSat;
  const discountThb = discountSat / 100;
  const finalThb = finalSat / 100;

  return {
    valid: true,
    message:
      dType === 'percent'
        ? `ใช้โค้ดส่วนลด ${rawAmt}% สำเร็จ (ลด ฿${discountThb.toFixed(2)})`
        : `ใช้โค้ดส่วนลด ฿${discountThb.toFixed(2)} สำเร็จ`,
    discountSatang: discountSat,
    discountThb,
    originalTotalThb: origThb,
    finalTotalSatang: finalSat,
    finalTotalThb: finalThb,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discount_type: dType,
      amount: rawAmt,
      min_spend: minSpendThb,
    },
  };
}

export function computeStoreSummary(params: {
  products: any[];
  users: any[];
  orders: any[];
  keys: any[];
}) {
  const { products = [], users = [], orders = [], keys = [] } = params;
  const unusedKeys = keys.filter((k) => k && !k.is_used);
  const prodBySlug = new Map<string, any>();
  for (const p of products) {
    if (p?.slug) prodBySlug.set(String(p.slug), p);
    if (p?.id) prodBySlug.set(String(p.id), p);
  }

  const paidStatuses = new Set(['paid', 'delivered', 'completed']);
  const paidOrders = orders.filter((o) => o && paidStatuses.has(String(o.status || '').toLowerCase()));
  const totalSold = products.reduce((sum, p) => sum + (Number(p?.sold) || 0), 0);

  // Recent restocks grouped by latest key additions per product
  const latestKeyByProd = new Map<string, { prod: any; count: number; latestAt: number; latestIso: string }>();
  for (const k of unusedKeys) {
    const pid = String(k.product_id || '');
    const prod = prodBySlug.get(pid);
    if (!prod) continue;
    const slug = String(prod.slug || prod.id);
    const ts = new Date(k.created_at || prod.updatedAt || 0).getTime() || 0;
    const prev = latestKeyByProd.get(slug);
    if (!prev) {
      latestKeyByProd.set(slug, {
        prod,
        count: 1,
        latestAt: ts,
        latestIso: k.created_at || prod.updatedAt || new Date().toISOString(),
      });
    } else {
      prev.count += 1;
      if (ts > prev.latestAt) {
        prev.latestAt = ts;
        prev.latestIso = k.created_at || prev.latestIso;
      }
    }
  }

  const recentRestocks = Array.from(latestKeyByProd.values())
    .sort((a, b) => b.latestAt - a.latestAt)
    .slice(0, 6)
    .map((entry) => ({
      slug: entry.prod.slug || entry.prod.id,
      name: String(entry.prod.name || ''),
      tag: String(entry.prod.tag || 'General'),
      img: String(entry.prod.img || '/assets/img/hero.jpg'),
      stock: entry.count,
      from: Number(entry.prod.from) || entry.prod.plans?.[0]?.price || 0,
      updatedAt: entry.latestIso,
    }));

  const recentOrders = paidOrders
    .slice(-10)
    .reverse()
    .map((o) => {
      const slug = o.product?.slug || o.product?.id || '';
      const prod = prodBySlug.get(String(slug));
      return {
        id: o.id,
        slug,
        name: String(o.product?.name || prod?.name || 'สินค้าดิจิทัล'),
        img: String(prod?.img || '/assets/img/hero.jpg'),
        plan: String(o.plan?.label || ''),
        total: Number(o.total) || 0,
        buyer: maskBuyerName(o.contact || o.user || 'User'),
        createdAt: o.createdAt || o.created_at || o.paidAt || new Date().toISOString(),
      };
    });

  return {
    totalUsers: users.length,
    totalProducts: products.length,
    readyStock: unusedKeys.length,
    totalSold: Math.max(totalSold, paidOrders.length),
    recentRestocks,
    recentOrders,
  };
}

function toBkkDate(d: Date): Date {
  return new Date(d.getTime() + 7 * 3600 * 1000);
}

export function computeExtendedAdminAnalytics(params: {
  orders: any[];
  topups: any[];
  manualTopups: any[];
  users: any[];
  products: any[];
  keys: any[];
  now?: Date;
}) {
  const { orders = [], topups = [], manualTopups = [], users = [], products = [], keys = [], now = new Date() } = params;
  const paidStatuses = new Set(['paid', 'delivered', 'completed']);
  const approvedStatuses = new Set(['approved', 'completed']);

  const prodBySlug = new Map<string, any>();
  for (const p of products) {
    if (p?.slug) prodBySlug.set(String(p.slug), p);
    if (p?.id) prodBySlug.set(String(p.id), p);
  }

  const paidOrders = orders.filter((o) => o && paidStatuses.has(String(o.status || '').toLowerCase()));
  const bkkNow = toBkkDate(now);

  const buildDailySeries = (days: number) => {
    const buckets: {
      key: string;
      label: string;
      revenue: number;
      topup: number;
      ordersCount: number;
      newUsers: number;
    }[] = [];
    const map = new Map<string, (typeof buckets)[number]>();

    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(bkkNow.getTime() - i * 86400_000);
      const key = dt.toISOString().slice(0, 10);
      const dayNum = dt.getUTCDate();
      const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const label = `${dayNum} ${monthNames[dt.getUTCMonth()]}`;
      const row = { key, label, revenue: 0, topup: 0, ordersCount: 0, newUsers: 0 };
      buckets.push(row);
      map.set(key, row);
    }

    for (const o of paidOrders) {
      const ts = new Date(o.paidAt || o.createdAt || o.created_at || 0);
      if (Number.isNaN(ts.getTime())) continue;
      const key = toBkkDate(ts).toISOString().slice(0, 10);
      const b = map.get(key);
      if (b) {
        b.revenue = Math.round((b.revenue + (Number(o.total) || 0)) * 100) / 100;
        b.ordersCount += 1;
      }
    }

    for (const t of [...topups, ...manualTopups]) {
      if (!t || !approvedStatuses.has(String(t.status || '').toLowerCase())) continue;
      const ts = new Date(t.createdAt || t.created_at || 0);
      if (Number.isNaN(ts.getTime())) continue;
      const key = toBkkDate(ts).toISOString().slice(0, 10);
      const b = map.get(key);
      if (b) {
        b.topup = Math.round((b.topup + (Number(t.amount) || 0)) * 100) / 100;
      }
    }

    for (const u of users) {
      const ts = new Date(u.createdAt || u.created_at || 0);
      if (Number.isNaN(ts.getTime())) continue;
      const key = toBkkDate(ts).toISOString().slice(0, 10);
      const b = map.get(key);
      if (b) {
        b.newUsers += 1;
      }
    }

    return buckets;
  };

  const buildMonthlySeries = () => {
    const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const buckets: {
      key: string;
      label: string;
      revenue: number;
      topup: number;
      ordersCount: number;
      newUsers: number;
    }[] = [];
    const map = new Map<string, (typeof buckets)[number]>();

    const baseYear = bkkNow.getUTCFullYear();
    const baseMonth = bkkNow.getUTCMonth();

    for (let i = 11; i >= 0; i--) {
      const dt = new Date(Date.UTC(baseYear, baseMonth - i, 1));
      const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = monthNames[dt.getUTCMonth()];
      const row = { key, label, revenue: 0, topup: 0, ordersCount: 0, newUsers: 0 };
      buckets.push(row);
      map.set(key, row);
    }

    for (const o of paidOrders) {
      const ts = new Date(o.paidAt || o.createdAt || o.created_at || 0);
      if (Number.isNaN(ts.getTime())) continue;
      const key = toBkkDate(ts).toISOString().slice(0, 7);
      const b = map.get(key);
      if (b) {
        b.revenue = Math.round((b.revenue + (Number(o.total) || 0)) * 100) / 100;
        b.ordersCount += 1;
      }
    }

    for (const t of [...topups, ...manualTopups]) {
      if (!t || !approvedStatuses.has(String(t.status || '').toLowerCase())) continue;
      const ts = new Date(t.createdAt || t.created_at || 0);
      if (Number.isNaN(ts.getTime())) continue;
      const key = toBkkDate(ts).toISOString().slice(0, 7);
      const b = map.get(key);
      if (b) {
        b.topup = Math.round((b.topup + (Number(t.amount) || 0)) * 100) / 100;
      }
    }

    for (const u of users) {
      const ts = new Date(u.createdAt || u.created_at || 0);
      if (Number.isNaN(ts.getTime())) continue;
      const key = toBkkDate(ts).toISOString().slice(0, 7);
      const b = map.get(key);
      if (b) {
        b.newUsers += 1;
      }
    }

    return buckets;
  };

  // Revenue by Category (all time)
  const catMap = new Map<string, { tag: string; revenue: number; orders: number }>();
  let totalCategoryRev = 0;
  for (const o of paidOrders) {
    const prod = prodBySlug.get(String(o.product?.slug || o.product?.id || ''));
    const tag = String(o.product?.tag || prod?.tag || 'General');
    const rev = Number(o.total) || 0;
    totalCategoryRev += rev;
    const entry = catMap.get(tag) || { tag, revenue: 0, orders: 0 };
    entry.revenue = Math.round((entry.revenue + rev) * 100) / 100;
    entry.orders += 1;
    catMap.set(tag, entry);
  }
  const revenueByCategory = Array.from(catMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((c) => ({
      ...c,
      sharePct: totalCategoryRev > 0 ? Math.round((c.revenue / totalCategoryRev) * 1000) / 10 : 0,
    }));

  // 24h Hourly Sales Breakdown in BKK
  const hourly24 = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    orders: 0,
    revenue: 0,
  }));
  for (const o of paidOrders) {
    const ts = new Date(o.paidAt || o.createdAt || o.created_at || 0);
    if (Number.isNaN(ts.getTime())) continue;
    const bkkHr = toBkkDate(ts).getUTCHours();
    if (hourly24[bkkHr]) {
      hourly24[bkkHr].orders += 1;
      hourly24[bkkHr].revenue = Math.round((hourly24[bkkHr].revenue + (Number(o.total) || 0)) * 100) / 100;
    }
  }

  // Topup channels breakdown
  const channelCounts: Record<string, { id: string; label: string; count: number; amount: number }> = {
    promptpay: { id: 'promptpay', label: 'PromptPay QR', count: 0, amount: 0 },
    manual: { id: 'manual', label: 'โอนผ่านธนาคาร (สลิป)', count: 0, amount: 0 },
    truemoney: { id: 'truemoney', label: 'TrueMoney อั่งเปา', count: 0, amount: 0 },
  };
  for (const t of topups) {
    if (!t || !approvedStatuses.has(String(t.status || '').toLowerCase())) continue;
    const key = t.method === 'truemoney' ? 'truemoney' : 'promptpay';
    channelCounts[key].count += 1;
    channelCounts[key].amount = Math.round((channelCounts[key].amount + (Number(t.amount) || 0)) * 100) / 100;
  }
  for (const mt of manualTopups) {
    if (!mt || !approvedStatuses.has(String(mt.status || '').toLowerCase())) continue;
    channelCounts.manual.count += 1;
    channelCounts.manual.amount = Math.round((channelCounts.manual.amount + (Number(mt.amount) || 0)) * 100) / 100;
  }
  const totalTopupAmt = Object.values(channelCounts).reduce((s, c) => s + c.amount, 0);
  const topupMethods = Object.values(channelCounts).map((c) => ({
    ...c,
    sharePct: totalTopupAmt > 0 ? Math.round((c.amount / totalTopupAmt) * 1000) / 10 : 0,
  }));

  // Low stock products & best sellers
  const lowStockProducts = products
    .map((p) => {
      const slug = p.slug || p.id;
      const unused = keys.filter((k) => (k.product_id === slug || k.product_id === p.id) && !k.is_used).length;
      return { slug, name: p.name, tag: p.tag || 'General', stock: unused, updating: Boolean(p.updating) };
    })
    .filter((p) => p.stock <= 5)
    .sort((a, b) => a.stock - b.stock);

  const userById = new Map<string, any>();
  for (const u of users) userById.set(String(u.id), u);
  const spenderMap = new Map<string, { userId: string; username: string; orders: number; spent: number }>();
  for (const o of paidOrders) {
    const uid = String(o.userId || o.contact || 'guest');
    const u = userById.get(uid);
    const uname = String(u?.username || o.contact || 'Guest');
    const row = spenderMap.get(uid) || { userId: uid, username: uname, orders: 0, spent: 0 };
    row.orders += 1;
    row.spent = Math.round((row.spent + (Number(o.total) || 0)) * 100) / 100;
    spenderMap.set(uid, row);
  }
  const topSpenders = Array.from(spenderMap.values())
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 6);

  return {
    daily7: buildDailySeries(7),
    daily30: buildDailySeries(30),
    monthly12: buildMonthlySeries(),
    revenueByCategory,
    hourly24,
    topupMethods,
    lowStockProducts,
    topSpenders,
  };
}
