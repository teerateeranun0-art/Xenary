import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Satang,
  timingSafeStrEqual,
  escapeHtml,
  validateUsername,
  isSafePublicPath,
  promptpayCrc16,
  generatePromptpayPayload,
  isSafeHttpUrl,
  isSafeSlipUrl,
  isValidProductSlug,
  sanitizePlans,
  filterAndEnrichKeys,
  computeAdminStats,
} from './security';

test('Satang converts THB to satangs accurately without float rounding bug', () => {
  const s = Satang.fromThb(120.75);
  assert.equal(s.amountSatangs, 12075);
  assert.equal(s.toThb(), 120.75);

  const a = Satang.fromThb(10.20);
  const b = Satang.fromThb(20.30);
  const sum = a.checkedAdd(b);
  assert.notEqual(sum, null);
  assert.equal(sum!.amountSatangs, 3050);
  assert.equal(sum!.toThb(), 30.50);

  const diff = b.checkedSub(a);
  assert.notEqual(diff, null);
  assert.equal(diff!.amountSatangs, 1010);
  assert.equal(diff!.toThb(), 10.10);

  // Subtraction below zero returns null (prevents negative balance)
  assert.equal(a.checkedSub(b), null);

  // Negative float throws
  assert.throws(() => Satang.fromThb(-50));
});

test('timingSafeStrEqual prevents timing side-channel attacks', () => {
  const secret = 'xn_adm_key_99887766';
  assert.equal(timingSafeStrEqual(secret, secret), true);
  assert.equal(timingSafeStrEqual(secret, 'xn_adm_key_99887765'), false);
  assert.equal(timingSafeStrEqual(secret, 'short'), false);
  assert.equal(timingSafeStrEqual('', secret), false);
});

test('escapeHtml encodes dangerous HTML characters to prevent XSS', () => {
  const input = `<script>alert('pwned')</script>&"`;
  const clean = escapeHtml(input);
  assert.equal(clean, '&lt;script&gt;alert(&#39;pwned&#39;)&lt;/script&gt;&amp;&quot;');
});

test('validateUsername enforces strict 3-20 alphanumeric and underscore', () => {
  assert.equal(validateUsername('valid_user_01'), true);
  assert.equal(validateUsername('admin'), true);
  assert.equal(validateUsername('ab'), false); // Too short
  assert.equal(validateUsername('this_username_is_way_too_long_for_system'), false);
  assert.equal(validateUsername('<script>'), false);
  assert.equal(validateUsername('user name'), false);
});

test('isSafePublicPath blocks path traversal and forbidden files', () => {
  assert.equal(isSafePublicPath('../../../etc/passwd'), false);
  assert.equal(isSafePublicPath('/src/data/users.json'), false);
  assert.equal(isSafePublicPath('/.env'), false);
  assert.equal(isSafePublicPath('/package.json'), false);
  assert.equal(isSafePublicPath('/server.ts'), false);
  assert.equal(isSafePublicPath('/src/utils/security.ts'), false);
  assert.equal(isSafePublicPath('/src/lib/firebase.ts'), false);
  assert.equal(isSafePublicPath('/src/db/postgres.ts'), false);
  assert.equal(isSafePublicPath('/supabase/schema.sql'), false);
  assert.equal(isSafePublicPath('/firestore.rules'), false);
  assert.equal(isSafePublicPath('/eslint.config.mjs'), false);
  assert.equal(isSafePublicPath('/firebase-applet-config.json'), false);
  assert.equal(isSafePublicPath('/%2e%2e/etc/passwd'), false);
  assert.equal(isSafePublicPath('/assets/css/site.css'), true);
  assert.equal(isSafePublicPath('/assets/js/firebase-client.js'), true);
  assert.equal(isSafePublicPath('/assets/img/logo.png'), true);
});

test('PromptPay payload builder generates valid EMVCo string', () => {
  const payload = generatePromptpayPayload('0812345678', Satang.fromThb(150.00));
  assert.ok(payload.startsWith('000201010212'));
  assert.ok(payload.includes('5303764'));
  assert.ok(payload.includes('5406150.00'));
  assert.ok(payload.endsWith(promptpayCrc16(payload.slice(0, -4))));
});

test('isSafeHttpUrl & isSafeSlipUrl prevent javascript and SVG data XSS vectors', () => {
  assert.equal(isSafeHttpUrl('https://discord.gg/xenary'), true);
  assert.equal(isSafeHttpUrl('/assets/img/logo.png'), true);
  assert.equal(isSafeHttpUrl('//evil.com/phish'), false);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeHttpUrl('mailto:support@xenary.store', { allowMailTel: true }), true);
  assert.equal(isSafeHttpUrl('tel:+66812345678', { allowMailTel: true }), true);
  assert.equal(isSafeHttpUrl('mailto:support@xenary.store', { allowMailTel: false }), false);

  assert.equal(isSafeSlipUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeSlipUrl('data:image/jpeg;base64,/9j/4AAQ'), true);
  assert.equal(isSafeSlipUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isSafeSlipUrl('javascript:alert(1)'), false);
});

test('isValidProductSlug & sanitizePlans validate catalog input strictly', () => {
  assert.equal(isValidProductSlug('val-pro_01'), true);
  assert.equal(isValidProductSlug('../bad'), false);
  assert.equal(isValidProductSlug('a'), false);
  assert.equal(isValidProductSlug('good slug'), false);

  const plans = sanitizePlans([
    { label: '1 Day', price: 79.5 },
    { label: 'BadNeg', price: -10 },
    { label: 'BadZero', price: 0 },
    { label: '', price: 100 },
    { label: '7 Days', price: 299, per: '/week' },
  ]);
  assert.deepEqual(plans, [
    { label: '1 Day', price: 79.5, per: '/1 Day' },
    { label: '7 Days', price: 299, per: '/week' },
  ]);
});

test('filterAndEnrichKeys filters by product, plan, __any__, status, and search q', () => {
  const products = [
    { id: 'p1', slug: 'val-cheat', name: 'Val Cheat', tag: 'VALORANT', img: '/v.png' },
    { id: 'p2', slug: 'apex-cheat', name: 'Apex Cheat', tag: 'APEX', img: '/a.png' },
  ];
  const keys = [
    { id: 'k1', product_id: 'val-cheat', plan_label: '1 Day', key_value: 'VAL-111', is_used: false },
    { id: 'k2', product_id: 'val-cheat', plan_label: null, key_value: 'VAL-ANY', is_used: false },
    { id: 'k3', product_id: 'val-cheat', plan_label: '7 Days', key_value: 'VAL-777', is_used: true, order_id: 'ORD-1' },
    { id: 'k4', product_id: 'apex-cheat', plan_label: '1 Day', key_value: 'APX-111', is_used: false },
  ];

  const unusedVal = filterAndEnrichKeys(keys, products, { product_id: 'val-cheat', status: 'unused' });
  assert.equal(unusedVal.length, 2);
  assert.equal(unusedVal[0].product_name, 'Val Cheat');

  const anyPlan = filterAndEnrichKeys(keys, products, { product_id: 'val-cheat', plan_label: '__any__' });
  assert.equal(anyPlan.length, 1);
  assert.equal(anyPlan[0].id, 'k2');

  const searchUsed = filterAndEnrichKeys(keys, products, { status: 'used', q: 'ord-1' });
  assert.equal(searchUsed.length, 1);
  assert.equal(searchUsed[0].id, 'k3');
});

test('computeAdminStats accurately calculates today/month/total revenue in BKK and pending counts', () => {
  const now = new Date('2026-11-15T10:00:00.000Z'); // 17:00 BKK on 2026-11-15
  const orders = [
    { id: 'o1', status: 'delivered', total: 100.5, paidAt: '2026-11-15T05:00:00.000Z' },
    { id: 'o2', status: 'paid', total: 200.25, paidAt: '2026-11-02T05:00:00.000Z' },
    { id: 'o3', status: 'delivered', total: 500, paidAt: '2026-10-20T05:00:00.000Z' },
    { id: 'o4', status: 'cancelled', total: 999, paidAt: '2026-11-15T05:00:00.000Z' },
  ];
  const stats = computeAdminStats(
    orders,
    [{ id: 'u1' }, { id: 'u2' }],
    [{ id: 't1', status: 'pending' }, { id: 't2', status: 'approved' }],
    [{ id: 'm1', status: 'pending' }],
    [{ is_used: false }, { is_used: true }],
    [{ slug: 'p1' }],
    now
  );
  assert.equal(stats.revenue_today, 100.5);
  assert.equal(stats.revenue_month, 300.75);
  assert.equal(stats.revenue_total, 800.75);
  assert.equal(stats.paid_orders_count, 3);
  assert.equal(stats.pending_topups_count, 2);
  assert.equal(stats.unused_keys_count, 1);
  assert.equal(stats.total_users, 2);
  assert.equal(stats.products_count, 1);
});
