import test from 'node:test';
import assert from 'node:assert/strict';
import { Satang } from './security';
import {
  maskBuyerName,
  evaluateDiscountCoupon,
  computeStoreSummary,
  computeExtendedAdminAnalytics,
} from './store-analytics';

test('maskBuyerName masks buyer handles cleanly without exposing full strings', () => {
  assert.equal(maskBuyerName('txz_nakp'), 'txz****');
  assert.equal(maskBuyerName('ab'), 'a****');
  assert.equal(maskBuyerName(''), 'US****');
});

test('evaluateDiscountCoupon computes percentage and fixed discounts in Satang accurately', () => {
  const pctCoupon = {
    id: 'cp_1',
    code: 'SALE15',
    coupon_type: 'discount' as const,
    discount_type: 'percent' as const,
    amount: 15,
    min_spend: 50,
    max_uses: 10,
    per_user_limit: 1,
    used_count: 2,
    enabled: true,
  };

  // 15% off 59.00 THB = 8.85 THB -> 50.15 THB (floor of 5900 * 15 / 100 = 885 satangs)
  const r1 = evaluateDiscountCoupon({
    coupon: pctCoupon,
    subtotalSatang: Satang.fromThb(59),
    usedByUserCount: 0,
  });
  assert.equal(r1.valid, true);
  assert.equal(r1.discountSatang, 885);
  assert.equal(r1.discountThb, 8.85);
  assert.equal(r1.finalTotalThb, 50.15);

  // Below minimum spend
  const rMin = evaluateDiscountCoupon({
    coupon: pctCoupon,
    subtotalSatang: Satang.fromThb(40),
    usedByUserCount: 0,
  });
  assert.equal(rMin.valid, false);
  assert.equal(rMin.reason, 'min_spend_not_met');

  // Fixed coupon capped so total cannot go below 0
  const fixedCoupon = {
    id: 'cp_2',
    code: 'FLAT100',
    coupon_type: 'discount' as const,
    discount_type: 'fixed' as const,
    amount: 100,
    enabled: true,
  };
  const rFixed = evaluateDiscountCoupon({
    coupon: fixedCoupon,
    subtotalSatang: Satang.fromThb(59),
    usedByUserCount: 0,
  });
  assert.equal(rFixed.valid, true);
  assert.equal(rFixed.discountThb, 59);
  assert.equal(rFixed.finalTotalThb, 0);

  // Rejects credit-type coupons in discount slot
  const creditCoupon = {
    id: 'cp_3',
    code: 'FREE50',
    coupon_type: 'credit' as const,
    amount: 50,
    enabled: true,
  };
  const rCred = evaluateDiscountCoupon({
    coupon: creditCoupon,
    subtotalSatang: Satang.fromThb(100),
  });
  assert.equal(rCred.valid, false);
  assert.equal(rCred.reason, 'not_discount_coupon');
});

test('evaluateDiscountCoupon enforces expiry, max_uses, and per_user_limit', () => {
  const expired = evaluateDiscountCoupon({
    coupon: {
      id: 'c_exp',
      code: 'OLD',
      coupon_type: 'discount',
      discount_type: 'fixed',
      amount: 10,
      expires_at: '2026-01-01T00:00:00.000Z',
      enabled: true,
    },
    subtotalSatang: Satang.fromThb(100),
    now: new Date('2026-11-16T00:00:00.000Z'),
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, 'expired');

  const usedUp = evaluateDiscountCoupon({
    coupon: {
      id: 'c_used',
      code: 'MAXED',
      coupon_type: 'discount',
      discount_type: 'fixed',
      amount: 10,
      per_user_limit: 1,
      enabled: true,
    },
    subtotalSatang: Satang.fromThb(100),
    usedByUserCount: 1,
  });
  assert.equal(usedUp.valid, false);
  assert.equal(usedUp.reason, 'already_used');
});

test('computeStoreSummary aggregates counts, restocks, and masked recent orders', () => {
  const summary = computeStoreSummary({
    products: [
      { slug: 'aim-color', name: 'VAL AIM COLOR', tag: 'Valorant', sold: 28, from: 59, img: '/a.png' },
      { slug: 'test', name: 'FiveM Mod', tag: 'FiveM', sold: 3, from: 59, img: '/b.png' },
    ],
    users: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
    keys: [
      { id: 'k1', product_id: 'aim-color', is_used: false, created_at: '2026-11-16T01:00:00Z' },
      { id: 'k2', product_id: 'aim-color', is_used: false, created_at: '2026-11-16T02:00:00Z' },
      { id: 'k3', product_id: 'test', is_used: true, created_at: '2026-11-15T01:00:00Z' },
    ],
    orders: [
      {
        id: 'ORD-1',
        status: 'delivered',
        total: 59,
        contact: 'thai_gamer99',
        product: { slug: 'aim-color', name: 'VAL AIM COLOR' },
        plan: { label: '1 วัน' },
        createdAt: '2026-11-16T03:00:00Z',
      },
    ],
  });

  assert.equal(summary.totalUsers, 3);
  assert.equal(summary.totalProducts, 2);
  assert.equal(summary.readyStock, 2);
  assert.equal(summary.totalSold, 31);
  assert.equal(summary.recentRestocks.length, 1);
  assert.equal(summary.recentRestocks[0].stock, 2);
  assert.equal(summary.recentOrders[0].buyer, 'tha****');
});

test('computeExtendedAdminAnalytics produces 7d/30d/12m series, category splits, and 24h distribution', () => {
  const now = new Date('2026-11-16T10:00:00.000Z'); // 17:00 BKK
  const out = computeExtendedAdminAnalytics({
    now,
    products: [{ slug: 'aim-color', name: 'VAL AIM COLOR', tag: 'Valorant', sold: 1 }],
    keys: [{ id: 'k1', product_id: 'aim-color', is_used: false }],
    users: [{ id: 'u1', username: 'txz_nakp', createdAt: '2026-11-16T02:00:00.000Z' }],
    orders: [
      {
        id: 'ORD-1',
        userId: 'u1',
        status: 'delivered',
        total: 59,
        product: { slug: 'aim-color', name: 'VAL AIM COLOR', tag: 'Valorant' },
        paidAt: '2026-11-16T10:00:00.000Z',
      },
    ],
    topups: [{ id: 'PP-1', method: 'promptpay', status: 'approved', amount: 100, createdAt: '2026-11-16T09:00:00.000Z' }],
    manualTopups: [{ id: 'MT-1', status: 'approved', amount: 50, created_at: '2026-11-16T08:00:00.000Z' }],
  });

  assert.equal(out.daily7.length, 7);
  assert.equal(out.daily30.length, 30);
  assert.equal(out.monthly12.length, 12);
  assert.equal(out.hourly24.length, 24);
  assert.equal(out.daily7[6].revenue, 59);
  assert.equal(out.daily7[6].topup, 150);
  assert.equal(out.daily7[6].newUsers, 1);
  assert.equal(out.hourly24[17].orders, 1); // 10:00 UTC == 17:00 BKK
  assert.equal(out.revenueByCategory[0].tag, 'Valorant');
  assert.equal(out.revenueByCategory[0].sharePct, 100);
  assert.equal(out.topSpenders[0].username, 'txz_nakp');
  assert.equal(out.topSpenders[0].spent, 59);
});
