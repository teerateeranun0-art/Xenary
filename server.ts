/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Full-stack Express server with Rust-verified security & Vite middleware integration.
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import {
  Satang,
  timingSafeStrEqual,
  escapeHtml,
  validateUsername,
  isSafePublicPath,
  generatePromptpayPayload,
  isSafeHttpUrl,
  isSafeSlipUrl,
  isValidProductSlug,
  sanitizePlans,
  filterAndEnrichKeys,
  computeAdminStats,
} from './src/utils/security';
import { verifyFirebaseIdToken } from './src/lib/firebase-admin';
import { createStoreAdapter } from './src/db/adapter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'src', 'data');
const SITE_ROOT = __dirname;

const store = createStoreAdapter({
  rootDir: SITE_ROOT,
  dataDir: DATA_DIR,
});

const withLock = <T>(key: string, task: () => Promise<T>): Promise<T> => store.withLock(key, task);
const readCollection = <T>(name: string, fallback: T): Promise<T> => store.readCollection(name, fallback);
const writeCollection = <T>(name: string, data: T): Promise<void> => store.writeCollection(name, data);
const getCatalogData = () => store.getCatalogData();
const saveProductsList = (products: any[]) => store.saveProductsList(products);

const asyncHandler =
  (fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<any>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// ----------------------------------------------------------------------------
// Authentication & Session Management
// ----------------------------------------------------------------------------
const COOKIE_NAME = 'xn_sid';
const TTL_REMEMBER = 30 * 24 * 3600 * 1000;
const TTL_SESSION = 24 * 3600 * 1000;

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    if (!stored || !stored.includes(':')) return false;
    const [saltHex, hashHex] = stored.split(':');
    const saltBuf = Buffer.from(saltHex, 'hex');
    const hashBuf = Buffer.from(hashHex, 'hex');
    const derived = crypto.scryptSync(String(password || ''), saltBuf, hashBuf.length);
    return crypto.timingSafeEqual(derived, hashBuf);
  } catch {
    return false;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = Object.create(null);
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts[0]?.trim();
    if (!name || name === '__proto__' || name === 'constructor' || name === 'prototype') return;
    const val = parts.slice(1).join('=').trim();
    try {
      list[name] = decodeURIComponent(val);
    } catch {
      list[name] = val;
    }
  });
  return list;
}

interface User {
  id: string;
  username: string;
  pass: string;
  balance: number;
  role: string;
  firebaseUid?: string;
  email?: string;
  banned?: boolean;
  ban_reason?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface Session {
  id: string;
  h: string;
  uid: string;
  exp: number;
}

interface AuthRequest extends Request {
  user?: User | null;
}

// ----------------------------------------------------------------------------
// CAPTCHA Generator
// ----------------------------------------------------------------------------
const FONT: Record<string, string> = {
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/11110/00001/00001/10001/01110',
  '6': '00110/01000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00010/01100',
};

const captchaMap = new Map<string, { code: string; exp: number }>();
function createCaptcha(): { id: string; image: string } {
  const now = Date.now();
  for (const [k, v] of captchaMap.entries()) {
    if (v.exp < now) captchaMap.delete(k);
  }
  const digits = '23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += digits[crypto.randomInt(digits.length)];
  }
  const id = crypto.randomBytes(12).toString('hex');
  captchaMap.set(id, { code, exp: now + 5 * 60 * 1000 });

  const W = 180;
  const H = 60;
  let g = '';
  for (let i = 0; i < 5; i++) {
    const x1 = Math.floor(Math.random() * W);
    const y1 = Math.floor(Math.random() * H);
    const x2 = Math.floor(Math.random() * W);
    const y2 = Math.floor(Math.random() * H);
    g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#555" stroke-width="1.5"/>`;
  }
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const pattern = FONT[ch] || FONT['2'];
    let cells = '';
    pattern.split('/').forEach((row, y) => {
      [...row].forEach((v, x) => {
        if (v === '1') {
          cells += `<rect x="${x * 4}" y="${y * 4}" width="3.8" height="3.8"/>`;
        }
      });
    });
    g += `<g fill="#f5f5f5" transform="translate(${16 + i * 32} ${14})">${cells}</g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#111827"/>${g}</svg>`;
  return {
    id,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  };
}

function verifyCaptcha(id: string, answer: string): boolean {
  if (!id) return false;
  const item = captchaMap.get(id);
  captchaMap.delete(id); // Single use
  if (!item || item.exp < Date.now()) return false;
  return String(answer || '').trim() === item.code;
}

// ----------------------------------------------------------------------------
// Middlewares: Security Headers, Body Parsing, Rate Limit
// ----------------------------------------------------------------------------
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.youtube.com https://s.ytimg.com https://apis.google.com https://*.firebaseapp.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob: https://*.ytimg.com https://i.ytimg.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self' https: wss: https://www.youtube.com",
      "frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com https://*.firebaseapp.com",
      "object-src 'none'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 1. Sliding Window In-Memory Rate Limiter Helper
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count += 1;
  return true;
}

// 2. Cross-Site Request Forgery (CSRF) Origin Verification on Mutating Endpoints
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/')) {
    const origin = req.headers['origin'];
    const host = req.headers['host'];
    if (origin && host) {
      try {
        const originHost = new URL(String(origin)).host;
        if (originHost !== host) {
          return res.status(403).json({ error: 'invalid_origin', message: 'ไม่อนุญาตการเข้าถึงข้าม Origin (Cross-origin request blocked)' });
        }
      } catch {
        return res.status(403).json({ error: 'invalid_origin', message: 'Invalid Origin Header' });
      }
    }
  }
  next();
});

// 3. Strict Path Traversal and Sensitive File Shield
app.use((req, res, next) => {
  const p = req.path || '/';
  if (!isSafePublicPath(p)) {
    return res.status(404).type('text/plain').send('404 Not Found');
  }
  next();
});

// 4. Attach User Session & Periodic Expired Session Cleanup
let lastSessionPrune = 0;
app.use(async (req: AuthRequest, _res: Response, next: NextFunction) => {
  req.user = null;
  try {
    const now = Date.now();
    if (now - lastSessionPrune > 10 * 60 * 1000) {
      lastSessionPrune = now;
      withLock('sessions-ledger', async () => {
        const currentSessions = await readCollection<Session[]>('sessions.json', []);
        const activeSessions = currentSessions.filter((s) => s.exp > now);
        if (activeSessions.length !== currentSessions.length) {
          await writeCollection('sessions.json', activeSessions);
        }
      }).catch(() => {});
    }

    const cookies = parseCookies(req);
    const token = cookies[COOKIE_NAME];
    if (token) {
      const tokenHash = sha256(token);
      const sessions = await readCollection<Session[]>('sessions.json', []);
      const sess = sessions.find((s) => s.h === tokenHash && s.exp > now);
      if (sess) {
        const users = await readCollection<User[]>('users.json', []);
        const u = users.find((x) => x.id === sess.uid);
        if (u && !u.banned) {
          req.user = u;
        }
      }
    }
  } catch (err) {
    console.error('[Session Middleware Error]:', err);
  }
  next();
});

const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user) return next();
  res.status(401).json({ error: 'login_required', message: 'กรุณาเข้าสู่ระบบ' });
};

const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === 'admin') return next();
  const adminKey = String(process.env.ADMIN_KEY || '').trim();
  const headerKey = String(req.headers['x-admin-key'] || '').trim();
  if (adminKey && headerKey && timingSafeStrEqual(headerKey, adminKey)) {
    return next();
  }
  res.status(403).json({ error: 'forbidden', message: 'ไม่มีสิทธิ์เข้าถึงระบบแอดมิน' });
};

// ----------------------------------------------------------------------------
// API Endpoints
// ----------------------------------------------------------------------------

// 1. Health & Status
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    rust_engine: 'active',
    storage: store.getCapabilities(),
    platform: 'AI Studio',
    version: '1.0.0',
  });
});

app.get(
  '/api/status',
  asyncHandler(async (_req, res) => {
    const [cat, orders, settings] = await Promise.all([
      getCatalogData(),
      readCollection<any[]>('orders.json', []),
      readCollection<any>('settings.json', {}),
    ]);
    const products = cat.products;
    res.json({
      store: settings.site_name || cat.store || 'XENARY',
      online: !settings.maintenance,
      maintenance: Boolean(settings.maintenance),
      uptimeSec: 3600,
      products: products.length,
      updatingCount: products.filter((p) => p.updating || p.status_mode === 'updating').length,
      orders: orders.length,
      paid: orders.filter((o) => o.status === 'paid' || o.status === 'delivered').length,
      pending: orders.filter((o) => o.status === 'pending').length,
      items: products.map((p) => ({
        slug: p.slug,
        name: p.name,
        tag: p.tag,
        img: p.img,
        stock: p.stock || 0,
        updating: Boolean(p.updating || p.status_mode === 'updating'),
        update_note: p.update_note || '',
        updatedAt: p.updatedAt || '2026-10-21',
      })),
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  })
);

// 2. Auth Endpoints
app.get('/api/auth/config', (_req, res) => {
  res.json({ turnstile: false, captcha_required: false });
});

app.get('/api/auth/captcha', (_req, res) => {
  res.json(createCaptcha());
});

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`register:${ip}`, 8, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'rate_limited', message: 'คุณสมัครสมาชิกบ่อยเกินไป กรุณารอ 15 นาที' });
    }

    const { username, password, captchaId, captchaAnswer, website, remember } = req.body || {};
    if (website) return res.status(400).json({ error: 'bad_captcha', message: 'รหัสยืนยันไม่ถูกต้อง' });

    if (captchaId && !verifyCaptcha(captchaId, captchaAnswer)) {
      return res.status(400).json({ error: 'bad_captcha', message: 'รหัสยืนยันไม่ถูกต้อง กรุณาลองใหม่' });
    }

    const cleanUsername = String(username || '').trim();
    if (!validateUsername(cleanUsername)) {
      return res.status(400).json({ error: 'bad_username', message: 'ชื่อผู้ใช้ต้องมีความยาว 3-20 ตัวอักษร (a-z, 0-9, _)' });
    }

    const pw = String(password || '');
    if (pw.length < 8 || pw.length > 72) {
      return res.status(400).json({ error: 'bad_password', message: 'รหัสผ่านต้องมีความยาว 8-72 ตัวอักษร' });
    }

    return withLock('ledger', async () => {
      const users = await readCollection<User[]>('users.json', []);
      if (users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
        return res.status(409).json({ error: 'username_taken', message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
      }

      const newUser: User = {
        id: `U${crypto.randomBytes(6).toString('hex')}`,
        username: cleanUsername,
        pass: hashPassword(pw),
        balance: 0,
        role: 'user',
        createdAt: new Date().toISOString(),
      };

      users.push(newUser);
      await writeCollection('users.json', users);

      const token = crypto.randomBytes(32).toString('hex');
      const ttl = remember ? TTL_REMEMBER : TTL_SESSION;
      const sessions = await readCollection<Session[]>('sessions.json', []);
      sessions.push({
        id: crypto.randomBytes(12).toString('hex'),
        h: sha256(token),
        uid: newUser.id,
        exp: Date.now() + ttl,
      });
      await writeCollection('sessions.json', sessions);

      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${remember ? `; Max-Age=${ttl / 1000}` : ''}`
      );

      return res.status(201).json({
        user: {
          id: newUser.id,
          username: newUser.username,
          balance: newUser.balance,
          role: newUser.role,
        },
      });
    });
  })
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { username, password, captchaId, captchaAnswer, website, remember } = req.body || {};
    if (website) return res.status(400).json({ error: 'bad_captcha', message: 'รหัสยืนยันไม่ถูกต้อง' });
    if (captchaId && !verifyCaptcha(captchaId, captchaAnswer)) {
      return res.status(400).json({ error: 'bad_captcha', message: 'รหัสยืนยันไม่ถูกต้อง กรุณาลองใหม่' });
    }

    const cleanUsername = String(username || '').trim().toLowerCase();
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`login:${ip}:${cleanUsername}`, 12, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'rate_limited', message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 10 นาที' });
    }
    const users = await readCollection<User[]>('users.json', []);
    const user = users.find((u) => u.username.toLowerCase() === cleanUsername);

    const isMatch = user && verifyPassword(String(password || ''), user.pass);
    if (!isMatch || !user) {
      return res.status(401).json({ error: 'bad_login', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'banned', message: 'บัญชีของคุณถูกระงับการใช้งาน' });
    }

    return withLock('sessions-ledger', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const ttl = remember ? TTL_REMEMBER : TTL_SESSION;
      const sessions = await readCollection<Session[]>('sessions.json', []);
      sessions.push({
        id: crypto.randomBytes(12).toString('hex'),
        h: sha256(token),
        uid: user.id,
        exp: Date.now() + ttl,
      });
      await writeCollection('sessions.json', sessions);

      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${remember ? `; Max-Age=${ttl / 1000}` : ''}`
      );

      res.json({
        user: {
          id: user.id,
          username: user.username,
          balance: user.balance,
          role: user.role,
        },
      });
    });
  })
);

app.post(
  '/api/auth/firebase',
  asyncHandler(async (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`firebase-auth:${ip}`, 20, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'rate_limited', message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' });
    }

    const authHeader = String(req.headers.authorization || '');
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const idToken = bearerToken || String(req.body?.idToken || '').trim();
    const remember = req.body?.remember !== false;

    let verified;
    try {
      verified = await verifyFirebaseIdToken(idToken);
    } catch {
      return res.status(401).json({
        error: 'invalid_firebase_token',
        message: 'การยืนยันตัวตนผ่าน Google ไม่สำเร็จหรือหมดอายุ กรุณาลองใหม่',
      });
    }

    return withLock('ledger', async () => {
      const users = await readCollection<User[]>('users.json', []);
      const emailLower = verified.email.toLowerCase();
      const isBootstrapAdmin = emailLower === 'teerateeranun0@gmail.com';
      const now = new Date().toISOString();

      let user = users.find(
        (u) => u.firebaseUid === verified.uid || (u.email && u.email.toLowerCase() === emailLower)
      );

      if (!user) {
        const rawName = (verified.name || emailLower.split('@')[0] || 'user')
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 15);
        let baseUsername = rawName.length >= 3 ? rawName : `xn_${verified.uid.slice(0, 8)}`;
        if (!validateUsername(baseUsername)) {
          baseUsername = `xn_${crypto.randomBytes(3).toString('hex')}`;
        }
        let candidate = baseUsername;
        let suffix = 1;
        while (users.some((u) => u.username.toLowerCase() === candidate.toLowerCase())) {
          const tag = `_${suffix++}`;
          candidate = `${baseUsername.slice(0, 20 - tag.length)}${tag}`;
        }

        user = {
          id: `U${crypto.randomBytes(6).toString('hex')}`,
          username: candidate,
          pass: '',
          balance: 0,
          role: isBootstrapAdmin ? 'admin' : 'user',
          firebaseUid: verified.uid,
          email: verified.email,
          createdAt: now,
          updatedAt: now,
        };
        users.push(user);
      } else {
        if (user.banned) {
          return res.status(403).json({ error: 'banned', message: 'บัญชีของคุณถูกระงับการใช้งาน' });
        }
        user.firebaseUid = verified.uid;
        user.email = verified.email;
        if (isBootstrapAdmin) {
          user.role = 'admin';
        }
        user.updatedAt = now;
      }

      await writeCollection('users.json', users);

      const token = crypto.randomBytes(32).toString('hex');
      const ttl = remember ? TTL_REMEMBER : TTL_SESSION;
      const sessions = await readCollection<Session[]>('sessions.json', []);
      sessions.push({
        id: crypto.randomBytes(12).toString('hex'),
        h: sha256(token),
        uid: user.id,
        exp: Date.now() + ttl,
      });
      await writeCollection('sessions.json', sessions);

      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${remember ? `; Max-Age=${ttl / 1000}` : ''}`
      );

      return res.json({
        user: {
          id: user.id,
          username: user.username,
          balance: user.balance,
          role: user.role,
          email: user.email,
        },
      });
    });
  })
);

app.post(
  '/api/auth/logout',
  asyncHandler(async (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies[COOKIE_NAME];
    if (token) {
      await withLock('sessions-ledger', async () => {
        const tokenHash = sha256(token);
        const sessions = (await readCollection<Session[]>('sessions.json', [])).filter(
          (s) => s.h !== tokenHash
        );
        await writeCollection('sessions.json', sessions);
      });
    }
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  })
);

app.get('/api/auth/me', (req: AuthRequest, res: Response) => {
  if (!req.user) return res.json({ user: null });
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      balance: req.user.balance,
      role: req.user.role,
    },
  });
});

// 3. Products
app.get(
  '/api/products',
  asyncHandler(async (_req, res) => {
    const [cat, allKeys] = await Promise.all([
      getCatalogData(),
      readCollection<any[]>('keys.json', []),
    ]);
    const rawProducts = cat.products;

    const products = rawProducts.map((p) => {
      const unusedKeys = allKeys.filter(
        (k) => (k.product_id === p.slug || k.product_id === p.id) && !k.is_used
      ).length;
      const fromPrice = Number.isFinite(p.from) ? p.from : p.plans?.[0]?.price || p.price || 0;
      const plansWithStock = (p.plans || []).map((pl: any) => {
        const pKeys = allKeys.filter(
          (k) =>
            (k.product_id === p.slug || k.product_id === p.id) &&
            !k.is_used &&
            (!k.plan_label || k.plan_label.toLowerCase() === String(pl.label).toLowerCase())
        ).length;
        return {
          ...pl,
          stock: pKeys,
        };
      });

      return {
        slug: p.slug,
        id: p.id || p.slug,
        channel: p.channel || p.slug,
        name: p.name,
        tag: p.tag || 'General',
        desc: p.desc || '',
        stock: unusedKeys,
        sold: Number(p.sold) || 0,
        bestSeller: Boolean(p.bestSeller),
        featured: Boolean(p.featured),
        key_based: true,
        img: p.img || '/assets/img/hero.jpg',
        plans: plansWithStock,
        download_url: p.download_url || '',
        unused_keys: unusedKeys,
        from: fromPrice,
        updating: Boolean(p.updating || p.status_mode === 'updating'),
        status_mode: p.updating || p.status_mode === 'updating' ? 'updating' : 'normal',
        update_note: p.update_note || '',
        updatedAt: p.updatedAt || new Date().toISOString().slice(0, 10),
      };
    });

    res.json({
      count: products.length,
      currency: '฿',
      currencyCode: 'THB',
      updatedAt: cat.updatedAt || new Date().toISOString().slice(0, 10),
      checkout: cat.checkout || {
        ticket: '/contact/',
        note: 'คำสั่งซื้ออัตโนมัติ จัดส่งคีย์ดิจิทัลทันทีหลังชำระเงิน',
      },
      products,
    });
  })
);

app.get(
  '/api/products/:slug',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const [cat, allKeys] = await Promise.all([
      getCatalogData(),
      readCollection<any[]>('keys.json', []),
    ]);
    const p = cat.products.find((x) => x.slug === slug || x.id === slug);
    if (!p) return res.status(404).json({ error: 'not_found', message: 'ไม่พบสินค้านี้' });
    const unusedKeys = allKeys.filter(
      (k) => (k.product_id === p.slug || k.product_id === p.id) && !k.is_used
    ).length;
    const plansWithStock = (p.plans || []).map((pl: any) => {
      const pKeys = allKeys.filter(
        (k) =>
          (k.product_id === p.slug || k.product_id === p.id) &&
          !k.is_used &&
          (!k.plan_label || k.plan_label.toLowerCase() === String(pl.label).toLowerCase())
      ).length;
      return {
        ...pl,
        stock: pKeys,
      };
    });
    res.json({
      product: {
        ...p,
        stock: unusedKeys,
        sold: Number(p.sold) || 0,
        from: Number(p.from) || 0,
        plans: plansWithStock,
      },
    });
  })
);

// 4. Orders (Protected by Atomic Satang Precision Lock)
app.post(
  '/api/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { product, plan, quantity = 1, contact } = req.body || {};
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
      return res.status(400).json({ error: 'bad_quantity', message: 'จำนวนต้องอยู่ระหว่าง 1 ถึง 10 ชิ้น' });
    }

    return withLock('ledger', async () => {
      const products = (await getCatalogData()).products;
      const item = products.find((p) => p.slug === product || p.id === product || p.channel === product);
      if (!item) return res.status(400).json({ error: 'unknown_product', message: 'ไม่พบสินค้านี้ในระบบ' });
      if (item.updating || item.status_mode === 'updating') {
        return res.status(409).json({ error: 'product_updating', message: 'สินค้านี้กำลังปิดปรับปรุงชั่วคราว' });
      }

      const chosenPlan = (item.plans || []).find((pl: any) => pl.label === plan) || item.plans?.[0];
      if (!chosenPlan) return res.status(400).json({ error: 'unknown_plan', message: 'ไม่พบแพ็กเกจที่เลือก' });

      let unitSatang: Satang;
      try {
        unitSatang = Satang.fromThb(Number(chosenPlan.price));
      } catch {
        return res.status(400).json({ error: 'invalid_price', message: 'ราคาแพ็กเกจไม่ถูกต้อง' });
      }

      const totalSatang = unitSatang.checkedMulQty(qty);
      if (!totalSatang) return res.status(400).json({ error: 'amount_overflow', message: 'ยอดสั่งซื้อเกินขีดจำกัด' });

      const users = await readCollection<User[]>('users.json', []);
      const userIndex = users.findIndex((u) => u.id === req.user!.id);
      const user = users[userIndex];
      if (!user) return res.status(404).json({ error: 'user_not_found', message: 'ไม่พบบัญชีผู้ใช้' });

      const userSatang = Satang.fromThb(Number(user.balance) || 0);
      const newBalSatang = userSatang.checkedSub(totalSatang);
      if (!newBalSatang) {
        return res.status(402).json({
          error: 'insufficient_balance',
          message: 'ยอดเงินคงเหลือไม่เพียงพอ กรุณาเติมเงินก่อนทำรายการ',
          balance: userSatang.toThb(),
          need: totalSatang.toThb(),
        });
      }

      const allKeys = await readCollection<any[]>('keys.json', []);
      const availableKeys = allKeys.filter(
        (k) =>
          (k.product_id === item.slug || k.product_id === item.id) &&
          !k.is_used &&
          (!k.plan_label || k.plan_label.toLowerCase() === chosenPlan.label.toLowerCase())
      );

      if (availableKeys.length < qty) {
        return res.status(409).json({
          error: 'insufficient_stock',
          message: `สินค้าแพ็กเกจ '${chosenPlan.label}' เหลือเพียง ${availableKeys.length} ชิ้น`,
        });
      }

      const newOrderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const now = new Date().toISOString();
      const pickedKeys = availableKeys.slice(0, qty);
      const pickedIds = new Set(pickedKeys.map((k) => k.id));

      allKeys.forEach((k) => {
        if (pickedIds.has(k.id)) {
          k.is_used = true;
          k.order_id = newOrderId;
          k.used_at = now;
        }
      });

      user.balance = newBalSatang.toThb();
      user.updatedAt = now;

      const remainingStock = allKeys.filter(
        (k) => (k.product_id === item.slug || k.product_id === item.id) && !k.is_used
      ).length;
      item.stock = remainingStock;
      item.sold = (Number(item.sold) || 0) + qty;

      const deliveredKeys = pickedKeys.map((k) => k.key_value);
      const newOrder = {
        id: newOrderId,
        status: 'delivered',
        userId: user.id,
        product: {
          slug: item.slug || item.id,
          name: item.name,
          tag: item.tag,
          download_url: item.download_url || null,
        },
        plan: { label: chosenPlan.label, per: chosenPlan.per || `/${chosenPlan.label}` },
        unitPrice: unitSatang.toThb(),
        quantity: qty,
        total: totalSatang.toThb(),
        currency: '฿',
        contact: contact ? String(contact).slice(0, 64) : user.username,
        keys_delivered: deliveredKeys,
        download_url: item.download_url || null,
        createdAt: now,
        paidAt: now,
      };

      const orders = await readCollection<any[]>('orders.json', []);
      orders.push(newOrder);

      await writeCollection('users.json', users);
      await writeCollection('keys.json', allKeys);
      await saveProductsList(products);
      await writeCollection('orders.json', orders);

      return res.status(201).json({
        ...newOrder,
        balance: user.balance,
        keys: deliveredKeys,
      });
    });
  })
);

app.get(
  '/api/orders/recent',
  asyncHandler(async (_req, res) => {
    const orders = await readCollection<any[]>('orders.json', []);
    const list = orders
      .filter((o) => ['paid', 'delivered', 'completed'].includes(o.status))
      .slice(-10)
      .reverse()
      .map((o) => ({
        slug: o.product?.slug || o.product?.id,
        name: escapeHtml(o.product?.name || 'สินค้า'),
        total: o.total,
        createdAt: o.createdAt,
        buyer: escapeHtml(String(o.contact || 'user').slice(0, 3) + '***'),
      }));
    res.json({ count: list.length, orders: list });
  })
);

app.get(
  '/api/orders/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await readCollection<any[]>('orders.json', []);
    const myOrders = orders
      .filter((o) => o.userId === req.user!.id)
      .slice(-30)
      .reverse()
      .map((o) => ({
        ...o,
        keys: Array.isArray(o.keys) && o.keys.length ? o.keys : o.keys_delivered || [],
      }));
    res.json({ orders: myOrders });
  })
);

// 5. Wallet & Topup
const isDemoTopupEnabled = () => process.env.ALLOW_DEMO_TOPUP === 'true';

app.get(
  '/api/wallet/config',
  asyncHandler(async (_req, res) => {
    const settings = await readCollection<any>('settings.json', {});
    res.json({
      demo: isDemoTopupEnabled(),
      truemoney: true,
      promptpay: true,
      phone: settings.truemoney_phone || '0812345678',
    });
  })
);

app.get(
  '/api/wallet/topups',
  requireAuth,
  asyncHandler(async (req, res) => {
    const topups = await readCollection<any[]>('topups.json', []);
    const list = topups
      .filter((t) => t.uid === req.user!.id)
      .slice(-20)
      .reverse();
    res.json({ balance: req.user!.balance, topups: list });
  })
);

app.post(
  '/api/wallet/truemoney',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!checkRateLimit(`truemoney:${req.user!.id}`, 6, 5 * 60 * 1000)) {
      return res.status(429).json({ error: 'rate_limited', message: 'คุณทำรายการบ่อยเกินไป กรุณารอ 5 นาที' });
    }
    const { link } = req.body || {};
    const voucherHash = String(link || '')
      .replace(/.*[?&]v=/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (!voucherHash || voucherHash.length < 8) {
      return res.status(400).json({ error: 'bad_link', message: 'ลิงก์ซองอั่งเปาไม่ถูกต้อง' });
    }
    if (!isDemoTopupEnabled()) {
      return res.status(400).json({
        error: 'truemoney_gateway_unavailable',
        message: 'ระบบรับซองอั่งเปาอัตโนมัติยังไม่เปิดใช้งาน กรุณาเติมผ่านพร้อมเพย์หรือแจ้งสลิปโอนเงิน',
      });
    }

    return withLock('ledger', async () => {
      const topups = await readCollection<any[]>('topups.json', []);
      if (topups.some((t) => t.voucher === voucherHash && t.status === 'completed')) {
        return res.status(409).json({ error: 'already_redeemed', message: 'ซองอั่งเปานี้เคยถูกรับไปแล้ว' });
      }

      const amountSatangs = Satang.fromThb(100.0);
      const users = await readCollection<User[]>('users.json', []);
      const u = users.find((x) => x.id === req.user!.id);
      if (!u) return res.status(404).json({ error: 'user_not_found', message: 'ไม่พบบัญชี' });

      const newBal = Satang.fromThb(u.balance).checkedAdd(amountSatangs);
      if (!newBal) return res.status(400).json({ error: 'balance_overflow', message: 'ยอดเงินเกินขีดจำกัด' });
      u.balance = newBal.toThb();

      const topupRec = {
        id: `TM-${Date.now().toString(36).toUpperCase()}`,
        uid: u.id,
        method: 'truemoney',
        amount: amountSatangs.toThb(),
        voucher: voucherHash,
        status: 'completed',
        createdAt: new Date().toISOString(),
      };
      topups.push(topupRec);

      await writeCollection('users.json', users);
      await writeCollection('topups.json', topups);

      res.json({
        ok: true,
        amount: amountSatangs.toThb(),
        balance: u.balance,
        message: `เติมเงินสำเร็จ ฿${amountSatangs.toThb().toFixed(2)} บาท`,
      });
    });
  })
);

app.post(
  '/api/wallet/promptpay',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount } = req.body || {};
    let amtSatang: Satang;
    try {
      amtSatang = Satang.fromThb(Number(amount));
      if (amtSatang.amountSatangs < 100 || amtSatang.amountSatangs > 100_000_00) {
        throw new Error('out_of_range');
      }
    } catch {
      return res.status(400).json({ error: 'bad_amount', message: 'จำนวนเงินต้องอยู่ระหว่าง 1 ถึง 100,000 บาท' });
    }

    const settings = await readCollection<any>('settings.json', {});
    const ppPhone = settings.promptpay_phone || settings.promptpay_id || '0812345678';
    const payload = generatePromptpayPayload(ppPhone, amtSatang);
    const qrImage = await QRCode.toDataURL(payload, { margin: 2, width: 260 });

    const topupId = `PP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const expiresInSec = 1800;
    const expiresAt = Date.now() + expiresInSec * 1000;

    await withLock('ledger', async () => {
      const topups = await readCollection<any[]>('topups.json', []);
      topups.push({
        id: topupId,
        uid: req.user!.id,
        method: 'promptpay',
        amount: amtSatang.toThb(),
        status: 'pending',
        expiresAt,
        createdAt: new Date().toISOString(),
      });
      await writeCollection('topups.json', topups);
    });

    res.json({
      id: topupId,
      amount: amtSatang.toThb(),
      baseAmount: amtSatang.toThb(),
      payload,
      qr: qrImage,
      qr_image: qrImage,
      expiresAt,
      expiresInSec,
    });
  })
);

app.post(
  '/api/wallet/promptpay/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    return withLock('ledger', async () => {
      const topups = await readCollection<any[]>('topups.json', []);
      const t = topups.find((item) => item.id === id && item.uid === req.user!.id);
      if (!t) return res.status(404).json({ error: 'topup_not_found', message: 'ไม่พบรายการเติมเงิน' });
      if (t.status === 'pending' || t.status === 'processing') {
        t.status = 'cancelled';
        await writeCollection('topups.json', topups);
      }
      res.json({ ok: true, topup: t });
    });
  })
);

app.post(
  '/api/wallet/promptpay/:id/simulate',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isDemoTopupEnabled()) {
      return res.status(403).json({
        error: 'demo_disabled',
        message: 'โหมดทดลองเติมเงินถูกปิดใช้งาน กรุณารอแอดมินตรวจสอบยอดหรือแจ้งสลิป',
      });
    }
    const { id } = req.params;
    return withLock('ledger', async () => {
      const topups = await readCollection<any[]>('topups.json', []);
      const t = topups.find((item) => item.id === id && item.uid === req.user!.id);
      if (!t) return res.status(404).json({ error: 'topup_not_found', message: 'ไม่พบรายการเติมเงิน' });
      if (t.status !== 'pending' && t.status !== 'processing') {
        return res.status(400).json({ error: 'invalid_status', message: 'รายการนี้ถูกดำเนินการไปแล้ว' });
      }
      if (t.expiresAt && Date.now() > Number(t.expiresAt)) {
        t.status = 'expired';
        await writeCollection('topups.json', topups);
        return res.status(400).json({ error: 'expired', message: 'QR หมดอายุแล้ว' });
      }

      const users = await readCollection<User[]>('users.json', []);
      const u = users.find((x) => x.id === req.user!.id);
      if (!u) return res.status(404).json({ error: 'user_not_found', message: 'ไม่พบบัญชี' });

      const cur = Satang.fromThb(u.balance);
      const topSat = Satang.fromThb(Number(t.amount) || 0);
      const newBal = cur.checkedAdd(topSat);
      if (!newBal) return res.status(400).json({ error: 'balance_overflow', message: 'ยอดเงินเกินขีดจำกัด' });

      u.balance = newBal.toThb();
      u.updatedAt = new Date().toISOString();
      t.status = 'approved';

      await writeCollection('users.json', users);
      await writeCollection('topups.json', topups);
      res.json({ ok: true, balance: u.balance, topup: t });
    });
  })
);

// 6. Manual Bank Transfer Topup (Slip)
app.get(
  '/api/manual-topup/channels',
  asyncHandler(async (_req, res) => {
    const allChannels = await readCollection<any[]>('payment_channels.json', [
      { id: 'kbank', name: 'ธนาคารกสิกรไทย (KBank)', account_no: '146-8-73566-7', account_name: 'XENARY STORE', enabled: true },
    ]);
    const channels = allChannels.filter((c) => c && c.enabled !== false);
    res.json({ channels });
  })
);

app.get(
  '/api/manual-topup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await readCollection<any[]>('manual_topups.json', []);
    const userList = list.filter((t) => t.user_id === req.user!.id).slice(-20).reverse();
    res.json({ topups: userList });
  })
);

app.post(
  '/api/manual-topup',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!checkRateLimit(`manual-topup:${req.user!.id}`, 10, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'rate_limited', message: 'ส่งสลิปบ่อยเกินไป กรุณารอสักครู่' });
    }
    const { channel_id, amount, slip_url, qr_payload } = req.body || {};
    let amtSatang: Satang;
    try {
      amtSatang = Satang.fromThb(Number(amount));
      if (amtSatang.amountSatangs <= 0) throw new Error();
    } catch {
      return res.status(400).json({ error: 'bad_amount', message: 'จำนวนเงินไม่ถูกต้อง' });
    }

    const cleanSlip = slip_url ? String(slip_url).trim() : '';
    const cleanQrPayload = qr_payload ? String(qr_payload).trim().slice(0, 2048) : '';
    if (!cleanSlip && !cleanQrPayload) {
      return res.status(400).json({ error: 'missing_slip', message: 'กรุณาอัปโหลดรูปภาพสลิป' });
    }
    if (cleanSlip && cleanSlip !== cleanQrPayload && !isSafeSlipUrl(cleanSlip)) {
      return res.status(400).json({ error: 'bad_slip_url', message: 'รูปแบบไฟล์สลิปไม่ถูกต้อง' });
    }

    return withLock('ledger', async () => {
      const [list, channels] = await Promise.all([
        readCollection<any[]>('manual_topups.json', []),
        readCollection<any[]>('payment_channels.json', []),
      ]);
      const ch = channels.find((c) => c.id === channel_id);
      const channelName = ch ? ch.name : String(channel_id || 'โอนผ่านธนาคาร').slice(0, 64);
      const item = {
        id: `MT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        user_id: req.user!.id,
        username: req.user!.username,
        channel_id: String(channel_id || 'kbank').slice(0, 64),
        channel_name: channelName,
        amount: amtSatang.toThb(),
        slip_url: cleanSlip || null,
        qr_payload: cleanQrPayload || null,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      list.push(item);
      await writeCollection('manual_topups.json', list);
      res.status(201).json({ ok: true, id: item.id, topup: item });
    });
  })
);

// 7. Coupon Redemption
app.post(
  '/api/coupon/redeem',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!checkRateLimit(`coupon:${req.user!.id}`, 6, 5 * 60 * 1000)) {
      return res.status(429).json({ error: 'rate_limited', message: 'คุณพยายามแลกคูปองบ่อยเกินไป กรุณารอ 5 นาที' });
    }

    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'bad_code', message: 'กรุณากรอกรหัสคูปอง' });

    return withLock('ledger', async () => {
      const coupons = await readCollection<any[]>('coupons.json', []);
      const cp = coupons.find((c) => c.code === code && c.enabled);
      if (!cp) return res.status(404).json({ error: 'not_found', message: 'ไม่พบรหัสคูปองนี้หรือคูปองหมดอายุ' });

      if (cp.max_uses != null && (Number(cp.used_count) || 0) >= Number(cp.max_uses)) {
        return res.status(400).json({ error: 'coupon_exhausted', message: 'คูปองนี้ถูกใช้งานครบตามจำนวนสิทธิ์แล้ว' });
      }

      const couponUses = await readCollection<any[]>('coupon_uses.json', []);
      const usedByUser = couponUses.filter((u) => u.coupon_id === cp.id && u.user_id === req.user!.id).length;
      if (usedByUser >= (cp.per_user_limit || 1)) {
        return res.status(400).json({ error: 'already_used', message: 'คุณเคยใช้สิทธิ์คูปองนี้ไปแล้ว' });
      }

      const rewardSatang = Satang.fromThb(Number(cp.amount) || 50);
      const users = await readCollection<User[]>('users.json', []);
      const u = users.find((x) => x.id === req.user!.id);
      if (!u) return res.status(404).json({ error: 'user_not_found', message: 'ไม่พบบัญชี' });

      const newBal = Satang.fromThb(u.balance).checkedAdd(rewardSatang);
      if (!newBal) return res.status(400).json({ error: 'balance_overflow', message: 'ยอดเงินเกินขีดจำกัด' });
      u.balance = newBal.toThb();

      cp.used_count = (Number(cp.used_count) || 0) + 1;

      couponUses.push({
        id: `CU-${Date.now().toString(36)}`,
        coupon_id: cp.id,
        code: cp.code,
        user_id: u.id,
        amount: rewardSatang.toThb(),
        used_at: new Date().toISOString(),
      });

      await writeCollection('users.json', users);
      await writeCollection('coupons.json', coupons);
      await writeCollection('coupon_uses.json', couponUses);

      res.json({
        ok: true,
        amount: rewardSatang.toThb(),
        balance: u.balance,
        message: `แลกคูปองสำเร็จ! ได้รับเครดิต ฿${rewardSatang.toThb().toFixed(2)}`,
      });
    });
  })
);

// 8. News & Support
app.get(
  '/api/news',
  asyncHandler(async (_req, res) => {
    const news = await readCollection<any[]>('news.json', []);
    const posts = news
      .filter((n) => n && n.published !== false)
      .map((n) => ({
        ...n,
        body: n.body ?? n.content ?? '',
        content: n.content ?? n.body ?? '',
        published: n.published !== false,
      }));
    res.json({ posts });
  })
);

app.get(
  '/api/support',
  asyncHandler(async (_req, res) => {
    const [rawLinks, settings] = await Promise.all([
      readCollection<any[]>('support_links.json', [
        { label: 'Discord Community', url: 'https://discord.gg/xenary', icon: 'discord', platform: 'discord', enabled: true },
        { label: 'Line Official', url: 'https://line.me/R/ti/p/@xenary', icon: 'line', platform: 'line', enabled: true },
      ]),
      readCollection<any>('settings.json', {}),
    ]);
    const links = rawLinks.filter((l) => l && l.enabled !== false);
    const safeDiscord =
      settings.discord_url && isSafeHttpUrl(String(settings.discord_url), { allowRelative: false })
        ? String(settings.discord_url)
        : undefined;
    res.json({ site_name: settings.site_name || 'XENARY', discord_url: safeDiscord, links });
  })
);

// 9. Admin Endpoints
app.get(
  '/api/admin/stats',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [orders, users, topups, manualTopups, keys, cat] = await Promise.all([
      readCollection<any[]>('orders.json', []),
      readCollection<User[]>('users.json', []),
      readCollection<any[]>('topups.json', []),
      readCollection<any[]>('manual_topups.json', []),
      readCollection<any[]>('keys.json', []),
      getCatalogData(),
    ]);
    res.json(computeAdminStats(orders, users, topups, manualTopups, keys, cat.products));
  })
);

app.get(
  '/api/admin/products',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [cat, keys] = await Promise.all([
      getCatalogData(),
      readCollection<any[]>('keys.json', []),
    ]);
    const list = cat.products.map((p) => {
      const unUsed = keys.filter((k) => (k.product_id === p.slug || k.product_id === p.id) && !k.is_used).length;
      const plansWithStock = (p.plans || []).map((pl: any) => {
        const pKeys = keys.filter(
          (k) =>
            (k.product_id === p.slug || k.product_id === p.id) &&
            !k.is_used &&
            (!k.plan_label || String(k.plan_label).toLowerCase() === String(pl.label).toLowerCase())
        ).length;
        return { ...pl, stock: pKeys };
      });
      return { ...p, stock: unUsed, plans: plansWithStock };
    });
    res.json({ products: list });
  })
);

app.get(
  '/api/admin/keys',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [keys, cat] = await Promise.all([
      readCollection<any[]>('keys.json', []),
      getCatalogData(),
    ]);
    const enriched = filterAndEnrichKeys(keys, cat.products, {
      product_id: typeof req.query.product_id === 'string' ? req.query.product_id : '',
      plan_label: typeof req.query.plan_label === 'string' ? req.query.plan_label : '',
      status: typeof req.query.status === 'string' ? req.query.status : 'all',
      q: typeof req.query.q === 'string' ? req.query.q : '',
    });
    res.json({ keys: enriched });
  })
);

app.post(
  '/api/admin/keys',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { product_id, plan_label, raw_keys, keys: keysArr, sync_stock } = req.body || {};
    const cleanProdId = String(product_id || '').trim();
    const lines = Array.isArray(keysArr)
      ? keysArr.map((l) => String(l || '').trim()).filter(Boolean)
      : String(raw_keys || '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);

    if (!cleanProdId || !lines.length) {
      return res.status(400).json({ error: 'missing_fields', message: 'กรุณาระบุสินค้าและคีย์อย่างน้อย 1 รายการ' });
    }

    await withLock('ledger', async () => {
      const [keys, cat] = await Promise.all([
        readCollection<any[]>('keys.json', []),
        getCatalogData(),
      ]);
      const now = new Date().toISOString();
      for (const line of lines) {
        keys.push({
          id: `k_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
          product_id: cleanProdId,
          plan_label: plan_label ? String(plan_label).trim() : null,
          key_value: line,
          is_used: false,
          order_id: null,
          created_at: now,
        });
      }
      await writeCollection('keys.json', keys);

      if (sync_stock !== false) {
        const prod = cat.products.find((p) => p.slug === cleanProdId || p.id === cleanProdId);
        if (prod) {
          prod.stock = keys.filter(
            (k) => (k.product_id === prod.slug || k.product_id === prod.id) && !k.is_used
          ).length;
          await saveProductsList(cat.products);
        }
      }
    });
    res.json({ ok: true, count: lines.length, added: lines.length });
  })
);

app.patch(
  '/api/admin/keys/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { product_id, plan_label, key_value, is_used } = req.body || {};
    return withLock('ledger', async () => {
      const keys = await readCollection<any[]>('keys.json', []);
      const k = keys.find((item) => item.id === id);
      if (!k) return res.status(404).json({ error: 'key_not_found' });
      if (product_id !== undefined) k.product_id = String(product_id).trim();
      if (plan_label !== undefined) k.plan_label = plan_label ? String(plan_label).trim() : null;
      if (key_value !== undefined) {
        const cleanVal = String(key_value).trim();
        if (!cleanVal) return res.status(400).json({ error: 'empty_key_value', message: 'ค่าคีย์ต้องไม่ว่างเปล่า' });
        k.key_value = cleanVal;
      }
      if (is_used !== undefined) {
        k.is_used = Boolean(is_used);
        if (!k.is_used) {
          k.order_id = null;
          k.used_at = null;
        }
      }
      await writeCollection('keys.json', keys);
      res.json({ ok: true, key: k });
    });
  })
);

app.delete(
  '/api/admin/keys/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    return withLock('ledger', async () => {
      const keys = await readCollection<any[]>('keys.json', []);
      const idx = keys.findIndex((k) => k.id === id);
      if (idx === -1) return res.status(404).json({ error: 'key_not_found' });
      keys.splice(idx, 1);
      await writeCollection('keys.json', keys);
      res.json({ ok: true });
    });
  })
);

app.delete(
  '/api/admin/keys/bulk/used',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const productId = typeof req.query.product_id === 'string' ? req.query.product_id.trim() : '';
    return withLock('ledger', async () => {
      let keys = await readCollection<any[]>('keys.json', []);
      const initial = keys.length;
      keys = keys.filter((k) => {
        if (!k.is_used) return true;
        if (productId && k.product_id !== productId) return true;
        return false;
      });
      await writeCollection('keys.json', keys);
      const removed = initial - keys.length;
      res.json({ ok: true, deleted: removed, removed });
    });
  })
);

app.post(
  '/api/admin/products/:slug/toggle-update',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    return withLock('ledger', async () => {
      const cat = await getCatalogData();
      const prod = cat.products.find((p) => p.slug === slug || p.id === slug);
      if (!prod) return res.status(404).json({ error: 'product_not_found' });
      prod.updating = req.body && req.body.updating !== undefined ? Boolean(req.body.updating) : !prod.updating;
      prod.status_mode = prod.updating ? 'updating' : 'normal';
      prod.updatedAt = new Date().toISOString();
      await saveProductsList(cat.products);
      res.json({ ok: true, updating: prod.updating });
    });
  })
);

app.post(
  '/api/admin/products',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const slug = String(body.slug || '').trim().toLowerCase();
    if (!name || !slug) return res.status(400).json({ error: 'missing_name_or_slug', message: 'กรุณาระบุชื่อและรหัสสินค้า (slug)' });
    if (!isValidProductSlug(slug)) {
      return res.status(400).json({ error: 'invalid_slug', message: 'รหัสสินค้า (slug) ใช้ได้เฉพาะ a-z, 0-9, -, _ ความยาว 2-64 ตัวอักษร' });
    }
    const plans = sanitizePlans(body.plans);
    if (!plans.length) {
      return res.status(400).json({ error: 'invalid_plans', message: 'กรุณาระบุแพ็กเกจและราคาที่มากกว่า 0 อย่างน้อย 1 รายการ' });
    }
    const img = String(body.img || '').trim() || '/assets/img/logo.png';
    if (!isSafeHttpUrl(img, { allowRelative: true })) {
      return res.status(400).json({ error: 'invalid_img_url', message: 'ลิงก์รูปภาพไม่ถูกต้อง' });
    }
    const downloadUrl = String(body.download_url || '').trim();
    if (downloadUrl && !isSafeHttpUrl(downloadUrl, { allowRelative: true })) {
      return res.status(400).json({ error: 'invalid_download_url', message: 'ลิงก์ดาวน์โหลดไม่ถูกต้อง' });
    }
    const tutorialVideo = String(body.tutorial_video || '').trim();
    if (tutorialVideo && !isSafeHttpUrl(tutorialVideo, { allowRelative: false })) {
      return res.status(400).json({ error: 'invalid_tutorial_url', message: 'ลิงก์วิดีโอไม่ถูกต้อง' });
    }

    return withLock('ledger', async () => {
      const cat = await getCatalogData();
      if (cat.products.some((p) => p.slug === slug || p.id === slug)) {
        return res.status(400).json({ error: 'slug_already_exists', message: 'รหัสสินค้า (slug) นี้มีอยู่ในระบบแล้ว' });
      }
      const isUpdating = Boolean(body.updating || body.status_mode === 'updating');
      const minPrice = plans.reduce((min, pl) => Math.min(min, pl.price), plans[0].price);
      const newProd = {
        id: slug,
        slug,
        channel: slug,
        name,
        tag: String(body.tag || 'General').trim() || 'General',
        img,
        download_url: downloadUrl,
        desc: String(body.desc || '').trim(),
        plans,
        from: minPrice,
        features: Array.isArray(body.features) ? body.features.map((f: any) => String(f || '').trim()).filter(Boolean) : [],
        tutorial_video: tutorialVideo,
        bestSeller: Boolean(body.bestSeller),
        featured: Boolean(body.featured),
        key_based: true,
        stock: 0,
        sold: 0,
        updating: isUpdating,
        status_mode: isUpdating ? 'updating' : 'normal',
        update_note: String(body.update_note || '').trim(),
        updatedAt: new Date().toISOString(),
      };
      cat.products.push(newProd);
      await saveProductsList(cat.products);
      res.json({ ok: true, product: newProd });
    });
  })
);

const updateProductHandler = asyncHandler(async (req, res) => {
  const targetSlug = String(req.params.slug || '').trim();
  const body = req.body || {};
  const nextName = body.name !== undefined ? String(body.name).trim() : undefined;
  const nextSlug = body.slug !== undefined ? String(body.slug).trim().toLowerCase() : undefined;

  if (nextName !== undefined && !nextName) {
    return res.status(400).json({ error: 'missing_name', message: 'กรุณาระบุชื่อสินค้า' });
  }
  if (nextSlug !== undefined && !isValidProductSlug(nextSlug)) {
    return res.status(400).json({ error: 'invalid_slug', message: 'รหัสสินค้า (slug) ไม่ถูกต้อง' });
  }
  if (body.img !== undefined && String(body.img).trim() && !isSafeHttpUrl(String(body.img).trim(), { allowRelative: true })) {
    return res.status(400).json({ error: 'invalid_img_url', message: 'ลิงก์รูปภาพไม่ถูกต้อง' });
  }
  if (body.download_url !== undefined && String(body.download_url).trim() && !isSafeHttpUrl(String(body.download_url).trim(), { allowRelative: true })) {
    return res.status(400).json({ error: 'invalid_download_url', message: 'ลิงก์ดาวน์โหลดไม่ถูกต้อง' });
  }
  if (body.tutorial_video !== undefined && String(body.tutorial_video).trim() && !isSafeHttpUrl(String(body.tutorial_video).trim(), { allowRelative: false })) {
    return res.status(400).json({ error: 'invalid_tutorial_url', message: 'ลิงก์วิดีโอไม่ถูกต้อง' });
  }
  let sanitizedPlans: any[] | undefined;
  if (body.plans !== undefined) {
    sanitizedPlans = sanitizePlans(body.plans);
    if (!sanitizedPlans.length) {
      return res.status(400).json({ error: 'invalid_plans', message: 'กรุณาระบุแพ็กเกจและราคาที่มากกว่า 0 อย่างน้อย 1 รายการ' });
    }
  }

  return withLock('ledger', async () => {
    const cat = await getCatalogData();
    const prod = cat.products.find((p) => p.slug === targetSlug || p.id === targetSlug);
    if (!prod) return res.status(404).json({ error: 'product_not_found', message: 'ไม่พบสินค้านี้' });

    const oldSlug = prod.slug;
    const oldId = prod.id;
    if (nextSlug && nextSlug !== oldSlug) {
      if (cat.products.some((p) => p !== prod && (p.slug === nextSlug || p.id === nextSlug))) {
        return res.status(400).json({ error: 'slug_already_exists', message: 'รหัสสินค้า (slug) ใหม่นี้ซ้ำกับสินค้าอื่น' });
      }
      prod.slug = nextSlug;
      prod.id = nextSlug;
      prod.channel = nextSlug;

      const keys = await readCollection<any[]>('keys.json', []);
      let migrated = false;
      for (const k of keys) {
        if (k.product_id === oldSlug || k.product_id === oldId) {
          k.product_id = nextSlug;
          migrated = true;
        }
      }
      if (migrated) await writeCollection('keys.json', keys);
    }

    if (nextName !== undefined) prod.name = nextName;
    if (body.tag !== undefined) prod.tag = String(body.tag || 'General').trim() || 'General';
    if (body.img !== undefined) prod.img = String(body.img || '').trim() || '/assets/img/logo.png';
    if (body.download_url !== undefined) prod.download_url = String(body.download_url || '').trim();
    if (body.tutorial_video !== undefined) prod.tutorial_video = String(body.tutorial_video || '').trim();
    if (body.desc !== undefined) prod.desc = String(body.desc || '').trim();
    if (body.bestSeller !== undefined) prod.bestSeller = Boolean(body.bestSeller);
    if (body.featured !== undefined) prod.featured = Boolean(body.featured);
    if (body.updating !== undefined || body.status_mode !== undefined) {
      const isUpd = Boolean(body.updating || body.status_mode === 'updating');
      prod.updating = isUpd;
      prod.status_mode = isUpd ? 'updating' : 'normal';
    }
    if (body.update_note !== undefined) prod.update_note = String(body.update_note || '').trim();
    if (Array.isArray(body.features)) {
      prod.features = body.features.map((f: any) => String(f || '').trim()).filter(Boolean);
    }
    if (sanitizedPlans) {
      prod.plans = sanitizedPlans;
      prod.from = sanitizedPlans.reduce((min, pl) => Math.min(min, pl.price), sanitizedPlans[0].price);
    }
    prod.updatedAt = new Date().toISOString();

    await saveProductsList(cat.products);
    res.json({ ok: true, product: prod });
  });
});

app.post('/api/admin/products/:slug', requireAdmin, updateProductHandler);
app.put('/api/admin/products/:slug', requireAdmin, updateProductHandler);
app.patch('/api/admin/products/:slug', requireAdmin, updateProductHandler);

app.delete(
  '/api/admin/products/:slug',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    return withLock('ledger', async () => {
      const cat = await getCatalogData();
      const idx = cat.products.findIndex((p) => p.slug === slug || p.id === slug);
      if (idx === -1) return res.status(404).json({ error: 'product_not_found' });
      cat.products.splice(idx, 1);
      await saveProductsList(cat.products);
      res.json({ ok: true });
    });
  })
);

app.get(
  '/api/admin/orders',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [orders, users] = await Promise.all([
      readCollection<any[]>('orders.json', []),
      readCollection<User[]>('users.json', []),
    ]);
    const userById = new Map(users.map((u) => [u.id, u.username]));
    const enriched = orders
      .slice(-200)
      .reverse()
      .map((o) => ({
        ...o,
        user: o.user || (o.userId ? userById.get(o.userId) : undefined) || o.contact || 'Guest',
      }));
    res.json({ orders: enriched });
  })
);

app.patch(
  '/api/admin/orders/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body || {};
    const allowedStatuses = new Set(['pending', 'paid', 'delivered', 'completed', 'cancelled', 'refunded']);
    if (status !== undefined && !allowedStatuses.has(String(status))) {
      return res.status(400).json({ error: 'invalid_status', message: 'สถานะออเดอร์ไม่ถูกต้อง' });
    }
    return withLock('ledger', async () => {
      const orders = await readCollection<any[]>('orders.json', []);
      const o = orders.find((item) => item.id === id);
      if (!o) return res.status(404).json({ error: 'order_not_found' });
      if (status) o.status = String(status);
      await writeCollection('orders.json', orders);
      res.json({ ok: true, order: o });
    });
  })
);

app.get(
  '/api/admin/users',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await readCollection<User[]>('users.json', []);
    const safe = users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      balance: Satang.fromThb(Number(u.balance) || 0).toThb(),
      banned: Boolean(u.banned),
      createdAt: u.createdAt,
    }));
    res.json({ users: safe });
  })
);

app.post(
  '/api/admin/users/:id/adjust-balance',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, set_balance } = req.body || {};

    if (set_balance !== undefined) {
      const n = Number(set_balance);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'bad_amount', message: 'จำนวนเงินไม่ถูกต้อง' });
      }
    } else if (amount !== undefined) {
      const n = Number(amount);
      if (!Number.isFinite(n)) {
        return res.status(400).json({ error: 'bad_amount', message: 'จำนวนเงินไม่ถูกต้อง' });
      }
    } else {
      return res.status(400).json({ error: 'missing_amount', message: 'กรุณาระบุจำนวนเงิน' });
    }

    return withLock('ledger', async () => {
      const users = await readCollection<User[]>('users.json', []);
      const u = users.find((item) => item.id === id);
      if (!u) return res.status(404).json({ error: 'user_not_found' });

      let cur = Satang.fromThb(Number(u.balance) || 0);
      try {
        if (set_balance !== undefined) {
          cur = Satang.fromThb(Number(set_balance));
        } else if (amount !== undefined) {
          const adj = Number(amount);
          if (adj >= 0) {
            const added = cur.checkedAdd(Satang.fromThb(adj));
            if (!added) return res.status(400).json({ error: 'balance_overflow', message: 'ยอดเงินเกินขีดจำกัด' });
            cur = added;
          } else {
            const subSat = Satang.fromThb(Math.abs(adj));
            cur = cur.checkedSub(subSat) || Satang.ZERO;
          }
        }
      } catch {
        return res.status(400).json({ error: 'bad_amount', message: 'จำนวนเงินเกินขีดจำกัดหรือไม่ถูกต้อง' });
      }
      u.balance = cur.toThb();
      u.updatedAt = new Date().toISOString();
      await writeCollection('users.json', users);
      res.json({ ok: true, balance: u.balance });
    });
  })
);

app.patch(
  '/api/admin/users/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role, banned } = req.body || {};
    return withLock('ledger', async () => {
      const users = await readCollection<User[]>('users.json', []);
      const u = users.find((item) => item.id === id);
      if (!u) return res.status(404).json({ error: 'user_not_found' });
      if (role !== undefined) u.role = role === 'admin' ? 'admin' : 'user';
      if (banned !== undefined) u.banned = Boolean(banned);
      u.updatedAt = new Date().toISOString();
      await writeCollection('users.json', users);
      res.json({ ok: true, user: { id: u.id, username: u.username, role: u.role, banned: u.banned } });
    });
  })
);

app.get(
  '/api/admin/topups',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = (req.query.status as string) || 'all';
    const [topups, users] = await Promise.all([
      readCollection<any[]>('topups.json', []),
      readCollection<User[]>('users.json', []),
    ]);
    const userById = new Map(users.map((u) => [u.id, u.username]));
    const filtered = status === 'all' ? topups : topups.filter((t) => t.status === status);
    res.json({
      topups: filtered
        .slice(-100)
        .reverse()
        .map((t) => ({ ...t, user: t.user || (t.uid ? userById.get(t.uid) : undefined) || t.uid })),
    });
  })
);

app.post(
  '/api/admin/topups/:id/:action',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id, action } = req.params;
    return withLock('ledger', async () => {
      const topups = await readCollection<any[]>('topups.json', []);
      const t = topups.find((item) => item.id === id);
      if (!t) return res.status(404).json({ error: 'topup_not_found' });

      if (action === 'approve') {
        if (t.status === 'approved' || t.status === 'completed') {
          return res.status(400).json({ error: 'already_approved' });
        }
        t.status = 'approved';
        const users = await readCollection<User[]>('users.json', []);
        const u = users.find((usr) => usr.id === t.uid || usr.username === t.user);
        if (u) {
          const cur = Satang.fromThb(u.balance);
          const topSat = Satang.fromThb(Number(t.amount) || 0);
          const added = cur.checkedAdd(topSat);
          if (added) u.balance = added.toThb();
          u.updatedAt = new Date().toISOString();
          await writeCollection('users.json', users);
        }
      } else if (action === 'reject') {
        t.status = 'rejected';
      } else {
        return res.status(400).json({ error: 'invalid_action' });
      }
      await writeCollection('topups.json', topups);
      res.json({ ok: true, topup: t });
    });
  })
);

app.get(
  '/api/admin/manual-topups',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = (req.query.status as string) || 'all';
    const topups = await readCollection<any[]>('manual_topups.json', []);
    const filtered = status === 'all' ? topups : topups.filter((t) => t.status === status);
    res.json({ topups: filtered.slice(-100).reverse() });
  })
);

app.post(
  '/api/admin/manual-topups/:id/:action',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id, action } = req.params;
    const note = req.body?.note !== undefined ? String(req.body.note).trim().slice(0, 200) : '';
    return withLock('ledger', async () => {
      const topups = await readCollection<any[]>('manual_topups.json', []);
      const t = topups.find((item) => item.id === id);
      if (!t) return res.status(404).json({ error: 'topup_not_found' });

      if (action === 'approve') {
        if (t.status === 'approved' || t.status === 'completed') {
          return res.status(400).json({ error: 'already_approved' });
        }
        t.status = 'approved';
        if (note) t.admin_note = note;
        const users = await readCollection<User[]>('users.json', []);
        const u = users.find((usr) => usr.id === t.user_id || usr.username === t.username);
        if (u) {
          const cur = Satang.fromThb(u.balance);
          const topSat = Satang.fromThb(Number(t.amount) || 0);
          const added = cur.checkedAdd(topSat);
          if (added) u.balance = added.toThb();
          u.updatedAt = new Date().toISOString();
          await writeCollection('users.json', users);
        }
      } else if (action === 'reject') {
        t.status = 'rejected';
        if (note) t.admin_note = note;
      } else {
        return res.status(400).json({ error: 'invalid_action' });
      }
      await writeCollection('manual_topups.json', topups);
      res.json({ ok: true, topup: t });
    });
  })
);

app.get(
  '/api/admin/coupons',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const coupons = await readCollection<any[]>('coupons.json', []);
    res.json({ coupons });
  })
);

app.post(
  '/api/admin/coupons',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { code, amount, max_uses, per_user_limit, note } = req.body || {};
    const cleanCode = String(code || '').trim().toUpperCase();
    let amtSatang: Satang;
    try {
      amtSatang = Satang.fromThb(Number(amount));
      if (!cleanCode || amtSatang.amountSatangs <= 0) throw new Error();
    } catch {
      return res.status(400).json({ error: 'missing_or_invalid_fields', message: 'กรุณาระบุโค้ดและมูลค่ามากกว่า 0 บาท' });
    }

    return withLock('ledger', async () => {
      const coupons = await readCollection<any[]>('coupons.json', []);
      if (coupons.some((c) => c.code === cleanCode)) {
        return res.status(409).json({ error: 'duplicate_coupon', message: 'รหัสคูปองนี้มีอยู่แล้ว' });
      }
      const parsedMax = max_uses != null && max_uses !== '' ? Number(max_uses) : null;
      const newCoupon = {
        id: `cp_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
        code: cleanCode,
        amount: amtSatang.toThb(),
        max_uses: parsedMax !== null && Number.isInteger(parsedMax) && parsedMax > 0 ? parsedMax : null,
        per_user_limit: Number.isInteger(Number(per_user_limit)) && Number(per_user_limit) > 0 ? Number(per_user_limit) : 1,
        used_count: 0,
        note: String(note || '').trim().slice(0, 200),
        enabled: true,
        created_at: new Date().toISOString(),
      };
      coupons.push(newCoupon);
      await writeCollection('coupons.json', coupons);
      res.json({ ok: true, coupon: newCoupon });
    });
  })
);

app.patch(
  '/api/admin/coupons/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { code, amount, max_uses, per_user_limit, note, enabled } = req.body || {};
    return withLock('ledger', async () => {
      const coupons = await readCollection<any[]>('coupons.json', []);
      const c = coupons.find((item) => item.id === id);
      if (!c) return res.status(404).json({ error: 'coupon_not_found' });
      if (code !== undefined) {
        const cleanCode = String(code).trim().toUpperCase();
        if (!cleanCode) return res.status(400).json({ error: 'invalid_code' });
        c.code = cleanCode;
      }
      if (amount !== undefined) {
        try {
          const amt = Satang.fromThb(Number(amount));
          if (amt.amountSatangs <= 0) throw new Error();
          c.amount = amt.toThb();
        } catch {
          return res.status(400).json({ error: 'invalid_amount', message: 'มูลค่าคูปองต้องมากกว่า 0' });
        }
      }
      if (max_uses !== undefined) {
        const m = max_uses != null && max_uses !== '' ? Number(max_uses) : null;
        c.max_uses = m !== null && Number.isInteger(m) && m > 0 ? m : null;
      }
      if (per_user_limit !== undefined) {
        const p = Number(per_user_limit);
        if (Number.isInteger(p) && p > 0) c.per_user_limit = p;
      }
      if (note !== undefined) c.note = String(note || '').trim().slice(0, 200);
      if (enabled !== undefined) c.enabled = Boolean(enabled);
      await writeCollection('coupons.json', coupons);
      res.json({ ok: true, coupon: c });
    });
  })
);

app.delete(
  '/api/admin/coupons/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    return withLock('ledger', async () => {
      const coupons = await readCollection<any[]>('coupons.json', []);
      const idx = coupons.findIndex((item) => item.id === id);
      if (idx === -1) return res.status(404).json({ error: 'coupon_not_found' });
      coupons.splice(idx, 1);
      await writeCollection('coupons.json', coupons);
      res.json({ ok: true });
    });
  })
);

app.get(
  '/api/admin/news',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const raw = await readCollection<any[]>('news.json', []);
    const normalized = raw.map((n) => ({
      ...n,
      body: n.body ?? n.content ?? '',
      content: n.content ?? n.body ?? '',
      image_url: n.image_url || '',
      published: n.published !== undefined ? Boolean(n.published) : true,
    }));
    res.json({ posts: normalized, news: normalized });
  })
);

app.post(
  '/api/admin/news',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body, content, image_url, badge, is_pinned, published } = req.body || {};
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return res.status(400).json({ error: 'title_required', message: 'กรุณาระบุหัวข้อประกาศ' });
    const imgUrl = String(image_url || '').trim();
    if (imgUrl && !isSafeHttpUrl(imgUrl, { allowRelative: true })) {
      return res.status(400).json({ error: 'invalid_image_url', message: 'ลิงก์รูปภาพไม่ถูกต้อง' });
    }
    const textBody = String(content ?? body ?? '').trim();
    return withLock('ledger', async () => {
      const news = await readCollection<any[]>('news.json', []);
      const now = new Date().toISOString();
      const n = {
        id: `news_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
        title: cleanTitle,
        body: textBody,
        content: textBody,
        image_url: imgUrl,
        badge: String(badge || 'ประกาศ').trim() || 'ประกาศ',
        is_pinned: Boolean(is_pinned),
        published: published !== undefined ? Boolean(published) : true,
        created_at: now,
        updated_at: now,
      };
      news.push(n);
      await writeCollection('news.json', news);
      res.json({ ok: true, news: n, post: n });
    });
  })
);

app.patch(
  '/api/admin/news/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, body, content, image_url, badge, is_pinned, published } = req.body || {};
    if (image_url !== undefined && String(image_url).trim() && !isSafeHttpUrl(String(image_url).trim(), { allowRelative: true })) {
      return res.status(400).json({ error: 'invalid_image_url', message: 'ลิงก์รูปภาพไม่ถูกต้อง' });
    }
    return withLock('ledger', async () => {
      const news = await readCollection<any[]>('news.json', []);
      const n = news.find((item) => item.id === id);
      if (!n) return res.status(404).json({ error: 'news_not_found' });
      if (title !== undefined) {
        const cleanTitle = String(title).trim();
        if (!cleanTitle) return res.status(400).json({ error: 'title_required' });
        n.title = cleanTitle;
      }
      if (content !== undefined || body !== undefined) {
        const txt = String(content ?? body ?? '').trim();
        n.body = txt;
        n.content = txt;
      }
      if (image_url !== undefined) n.image_url = String(image_url).trim();
      if (badge !== undefined) n.badge = String(badge).trim() || 'ประกาศ';
      if (is_pinned !== undefined) n.is_pinned = Boolean(is_pinned);
      if (published !== undefined) n.published = Boolean(published);
      n.updated_at = new Date().toISOString();
      await writeCollection('news.json', news);
      res.json({ ok: true, news: n, post: n });
    });
  })
);

app.delete(
  '/api/admin/news/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    return withLock('ledger', async () => {
      const news = await readCollection<any[]>('news.json', []);
      const idx = news.findIndex((item) => item.id === id);
      if (idx === -1) return res.status(404).json({ error: 'news_not_found' });
      news.splice(idx, 1);
      await writeCollection('news.json', news);
      res.json({ ok: true });
    });
  })
);

app.get(
  '/api/admin/channels',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const channels = await readCollection<any[]>('payment_channels.json', []);
    res.json({ channels });
  })
);

app.post(
  '/api/admin/channels',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, type, bank_name, account_no, account_name, qr, qr_img, sort_order } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanAccNo = String(account_no || '').trim();
    const cleanAccName = String(account_name || '').trim();
    if (!cleanName || !cleanAccNo || !cleanAccName) {
      return res.status(400).json({ error: 'missing_fields', message: 'กรุณาระบุชื่อช่องทาง เลขบัญชี และชื่อบัญชี' });
    }
    const cleanQr = String(qr_img ?? qr ?? '').trim();
    if (cleanQr && !isSafeSlipUrl(cleanQr)) {
      return res.status(400).json({ error: 'invalid_qr_url', message: 'ลิงก์รูป QR ไม่ถูกต้อง' });
    }
    return withLock('ledger', async () => {
      const channels = await readCollection<any[]>('payment_channels.json', []);
      const c = {
        id: `ch_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
        name: cleanName,
        type: String(type || 'bank').trim(),
        bank_name: String(bank_name || cleanName).trim(),
        account_no: cleanAccNo,
        account_name: cleanAccName,
        qr: cleanQr,
        qr_img: cleanQr,
        enabled: true,
        sort_order: Number(sort_order) || 0,
        created_at: new Date().toISOString(),
      };
      channels.push(c);
      await writeCollection('payment_channels.json', channels);
      res.json({ ok: true, channel: c });
    });
  })
);

app.patch(
  '/api/admin/channels/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, type, bank_name, account_no, account_name, qr, qr_img, enabled, sort_order } = req.body || {};
    const nextQr = qr_img !== undefined || qr !== undefined ? String(qr_img ?? qr ?? '').trim() : undefined;
    if (nextQr && !isSafeSlipUrl(nextQr)) {
      return res.status(400).json({ error: 'invalid_qr_url', message: 'ลิงก์รูป QR ไม่ถูกต้อง' });
    }
    return withLock('ledger', async () => {
      const channels = await readCollection<any[]>('payment_channels.json', []);
      const c = channels.find((item) => item.id === id);
      if (!c) return res.status(404).json({ error: 'channel_not_found' });
      if (name !== undefined) c.name = String(name).trim();
      if (type !== undefined) c.type = String(type).trim();
      if (bank_name !== undefined) c.bank_name = String(bank_name).trim();
      if (account_no !== undefined) c.account_no = String(account_no).trim();
      if (account_name !== undefined) c.account_name = String(account_name).trim();
      if (nextQr !== undefined) {
        c.qr = nextQr;
        c.qr_img = nextQr;
      }
      if (enabled !== undefined) c.enabled = Boolean(enabled);
      if (sort_order !== undefined && Number.isFinite(Number(sort_order))) c.sort_order = Number(sort_order);
      await writeCollection('payment_channels.json', channels);
      res.json({ ok: true, channel: c });
    });
  })
);

app.delete(
  '/api/admin/channels/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    return withLock('ledger', async () => {
      const channels = await readCollection<any[]>('payment_channels.json', []);
      const idx = channels.findIndex((item) => item.id === id);
      if (idx === -1) return res.status(404).json({ error: 'channel_not_found' });
      channels.splice(idx, 1);
      await writeCollection('payment_channels.json', channels);
      res.json({ ok: true });
    });
  })
);

app.get(
  '/api/admin/support-links',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const links = await readCollection<any[]>('support_links.json', []);
    res.json({ links });
  })
);

app.post(
  '/api/admin/support-links',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { platform, label, handle, badge, url, description, icon, sort_order } = req.body || {};
    const cleanLabel = String(label || '').trim();
    const cleanUrl = String(url || '').trim();
    if (!cleanLabel) return res.status(400).json({ error: 'label_required', message: 'กรุณาระบุชื่อช่องทางติดต่อ' });
    if (cleanUrl && !isSafeHttpUrl(cleanUrl, { allowRelative: true, allowMailTel: true })) {
      return res.status(400).json({ error: 'invalid_url', message: 'ลิงก์ช่องทางติดต่อไม่ถูกต้อง' });
    }
    return withLock('ledger', async () => {
      const links = await readCollection<any[]>('support_links.json', []);
      const pf = String(platform || 'custom').trim().toLowerCase();
      const item = {
        id: `sup_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
        platform: pf,
        label: cleanLabel,
        handle: String(handle || '').trim(),
        badge: String(badge || 'ออนไลน์ 24 ชม.').trim(),
        url: cleanUrl,
        description: String(description || '').trim(),
        icon: String(icon || pf).trim(),
        enabled: true,
        sort_order: Number(sort_order) || 0,
        created_at: new Date().toISOString(),
      };
      links.push(item);
      await writeCollection('support_links.json', links);
      res.json({ ok: true, link: item });
    });
  })
);

app.patch(
  '/api/admin/support-links/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { platform, label, handle, badge, url, description, icon, enabled, sort_order } = req.body || {};
    if (url !== undefined && String(url).trim() && !isSafeHttpUrl(String(url).trim(), { allowRelative: true, allowMailTel: true })) {
      return res.status(400).json({ error: 'invalid_url', message: 'ลิงก์ช่องทางติดต่อไม่ถูกต้อง' });
    }
    return withLock('ledger', async () => {
      const links = await readCollection<any[]>('support_links.json', []);
      const item = links.find((l) => l.id === id);
      if (!item) return res.status(404).json({ error: 'link_not_found' });
      if (platform !== undefined) item.platform = String(platform).trim().toLowerCase();
      if (label !== undefined) item.label = String(label).trim();
      if (handle !== undefined) item.handle = String(handle).trim();
      if (badge !== undefined) item.badge = String(badge).trim();
      if (url !== undefined) item.url = String(url).trim();
      if (description !== undefined) item.description = String(description).trim();
      if (icon !== undefined) item.icon = String(icon).trim();
      if (enabled !== undefined) item.enabled = Boolean(enabled);
      if (sort_order !== undefined && Number.isFinite(Number(sort_order))) item.sort_order = Number(sort_order);
      await writeCollection('support_links.json', links);
      res.json({ ok: true, link: item });
    });
  })
);

app.delete(
  '/api/admin/support-links/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    return withLock('ledger', async () => {
      const links = await readCollection<any[]>('support_links.json', []);
      const idx = links.findIndex((l) => l.id === id);
      if (idx === -1) return res.status(404).json({ error: 'link_not_found' });
      links.splice(idx, 1);
      await writeCollection('support_links.json', links);
      res.json({ ok: true });
    });
  })
);

app.get(
  '/api/admin/settings',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const settings = await readCollection<any>('settings.json', {});
    res.json({ settings });
  })
);

app.patch(
  '/api/admin/settings',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (body.banner_url !== undefined && String(body.banner_url).trim() && !isSafeHttpUrl(String(body.banner_url).trim(), { allowRelative: true })) {
      return res.status(400).json({ error: 'invalid_banner_url', message: 'ลิงก์แบนเนอร์ไม่ถูกต้อง' });
    }
    if (body.discord_url !== undefined && String(body.discord_url).trim() && !isSafeHttpUrl(String(body.discord_url).trim(), { allowRelative: false })) {
      return res.status(400).json({ error: 'invalid_discord_url', message: 'ลิงก์ Discord ไม่ถูกต้อง' });
    }
    return withLock('ledger', async () => {
      const settings = await readCollection<any>('settings.json', {});
      if (body.site_name !== undefined) settings.site_name = String(body.site_name).trim().slice(0, 64) || 'XENARY';
      if (body.truemoney_phone !== undefined) settings.truemoney_phone = String(body.truemoney_phone).trim().slice(0, 32);
      if (body.promptpay_id !== undefined) settings.promptpay_id = String(body.promptpay_id).trim().slice(0, 32);
      if (body.promptpay_phone !== undefined) settings.promptpay_phone = String(body.promptpay_phone).trim().slice(0, 32);
      if (body.topup_mode !== undefined) settings.topup_mode = ['direct', 'manual', 'promptpay'].includes(String(body.topup_mode)) ? String(body.topup_mode) : 'direct';
      if (body.banner_url !== undefined) settings.banner_url = String(body.banner_url).trim();
      if (body.discord_url !== undefined) settings.discord_url = String(body.discord_url).trim();
      if (body.maintenance !== undefined) settings.maintenance = Boolean(body.maintenance);
      settings.updated_at = new Date().toISOString();
      await writeCollection('settings.json', settings);
      res.json({ ok: true, settings });
    });
  })
);

// ----------------------------------------------------------------------------
// Direct Page & Static Asset Routing
// ----------------------------------------------------------------------------
app.use('/assets', express.static(path.join(SITE_ROOT, 'assets')));
app.use('/src/client', express.static(path.join(SITE_ROOT, 'src', 'client')));
app.use('/favicon.ico', (_req, res) => res.sendFile(path.join(SITE_ROOT, 'favicon.ico')));

const KNOWN_PAGES = [
  '/',
  '/products',
  '/products/',
  '/status',
  '/status/',
  '/tos',
  '/tos/',
  '/contact',
  '/contact/',
  '/login',
  '/login/',
  '/register',
  '/register/',
  '/account',
  '/account/',
  '/admin',
  '/admin/',
];

for (const page of KNOWN_PAGES) {
  app.get(page, (_req, res) => {
    const clean = page.replace(/^\//, '').replace(/\/$/, '');
    const file = clean ? path.join(SITE_ROOT, clean, 'index.html') : path.join(SITE_ROOT, 'index.html');
    if (fs.existsSync(file)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.sendFile(file);
    }
    return res.sendFile(path.join(SITE_ROOT, 'index.html'));
  });
}

// ----------------------------------------------------------------------------
// Vite Integration (Dev Mode) or Static Fallback
// ----------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(SITE_ROOT, 'dist')));
  }

  // Catch-all route returns index.html
  app.use('*', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(SITE_ROOT, 'index.html'));
  });

  // Global error handler for async routes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[XENARY Error]:', err);
    if (res.headersSent) return;
    res.status(500).json({
      error: 'internal_error',
      message: 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบข้อมูล กรุณาลองใหม่',
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    const caps = store.getCapabilities();
    console.log(
      `[XENARY] Store online at http://0.0.0.0:${PORT} (Rust Engine Verified, DB Driver: ${caps.driver})`
    );
  });
}

startServer();
