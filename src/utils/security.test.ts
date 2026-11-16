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
