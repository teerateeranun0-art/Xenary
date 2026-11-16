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
