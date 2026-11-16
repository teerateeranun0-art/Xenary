/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client-side Firebase Auth & Firestore integration for XENARY Store.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

let authReady = false;
let currentFirebaseUser: FirebaseUser | null = null;
let memoryIdToken: string | null = null;

onAuthStateChanged(auth, async (user) => {
  currentFirebaseUser = user;
  authReady = true;
  if (user) {
    try {
      memoryIdToken = await user.getIdToken();
    } catch {
      memoryIdToken = null;
    }
  } else {
    memoryIdToken = null;
  }
});

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  if (cleaned && ID_PATTERN.test(cleaned)) return cleaned;
  return `${fallbackPrefix}_${Date.now().toString(36)}`;
}

function buildSafeUsername(user: FirebaseUser): string {
  const rawBase =
    (user.displayName || '').trim() ||
    (user.email ? user.email.split('@')[0] : '') ||
    'xenary_user';
  let sanitized = rawBase.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (sanitized.length < 3) {
    sanitized = `u_${user.uid.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 8)}`;
  }
  sanitized = sanitized.slice(0, 20);
  if (!USERNAME_PATTERN.test(sanitized)) {
    return `user_${user.uid.slice(0, 8)}`.slice(0, 20);
  }
  return sanitized;
}

async function ensureFirestoreUserDocuments(user: FirebaseUser): Promise<void> {
  if (!user.uid || !ID_PATTERN.test(user.uid) || user.uid.length > 128) {
    throw new Error('Invalid Firebase UID');
  }
  const email = (user.email || '').trim().slice(0, 254);
  if (!email || email.length < 3) {
    throw new Error('บัญชี Google ไม่มีอีเมลที่ยืนยันแล้ว');
  }

  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!userSnap.exists()) {
    const safeUsername = buildSafeUsername(user);
    try {
      await setDoc(userRef, {
        uid: user.uid,
        username: safeUsername,
        role: 'user',
        balanceSatangs: 0,
        banned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  }

  const privatePath = `users/${user.uid}/private/info`;
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');
  let privateSnap;
  try {
    privateSnap = await getDoc(privateRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  if (!privateSnap.exists()) {
    try {
      await setDoc(privateRef, {
        uid: user.uid,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, privatePath);
    }
  }
}

export async function signInWithGoogle(remember = true) {
  const credential = await signInWithPopup(auth, googleProvider);
  const user = credential.user;
  if (!user || !user.emailVerified) {
    throw new Error('กรุณาใช้อีเมล Google ที่ผ่านการยืนยันแล้ว');
  }

  memoryIdToken = await user.getIdToken();

  try {
    await ensureFirestoreUserDocuments(user);
  } catch (err) {
    console.warn('Firestore profile sync warning:', err);
  }

  const res = await fetch('/api/auth/firebase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${memoryIdToken}`,
    },
    body: JSON.stringify({ remember: Boolean(remember) }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || payload.error || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
  }

  document.dispatchEvent(new Event('xn:auth'));
  return payload;
}

export async function signOut(): Promise<void> {
  memoryIdToken = null;
  try {
    await firebaseSignOut(auth);
  } catch {}
}

export async function syncOrderToFirestore(order: {
  id?: string;
  product?: { slug?: string; name?: string };
  plan?: { label?: string };
  quantity?: number;
  total?: number;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const orderId = sanitizeId(order.id || '', 'ORD');
  const productSlug = sanitizeId(order.product?.slug || 'item', 'prod');
  const productName = String(order.product?.name || 'สินค้า').trim().slice(0, 120) || 'สินค้า';
  const planLabel = String(order.plan?.label || 'มาตรฐาน').trim().slice(0, 64) || 'มาตรฐาน';
  const quantity = Math.max(1, Math.min(10, Math.floor(Number(order.quantity) || 1)));
  const totalSatangs = Math.max(
    0,
    Math.min(1_000_000_000_000, Math.round((Number(order.total) || 0) * 100))
  );

  const path = `orders/${orderId}`;
  try {
    await setDoc(doc(db, 'orders', orderId), {
      orderId,
      userId: user.uid,
      productSlug,
      productName,
      planLabel,
      quantity,
      totalSatangs,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncTopupToFirestore(topup: {
  id?: string;
  method?: 'promptpay' | 'truemoney' | 'slip' | 'coupon';
  amount?: number;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const topupId = sanitizeId(topup.id || '', 'TOP');
  const allowedMethods = ['promptpay', 'truemoney', 'slip', 'coupon'] as const;
  const method = allowedMethods.includes(topup.method as any)
    ? (topup.method as (typeof allowedMethods)[number])
    : 'promptpay';
  const amountSatangs = Math.max(
    1,
    Math.min(1_000_000_000_000, Math.round((Number(topup.amount) || 0) * 100))
  );

  const path = `topups/${topupId}`;
  try {
    await setDoc(doc(db, 'topups', topupId), {
      topupId,
      userId: user.uid,
      method,
      amountSatangs,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

declare global {
  interface Window {
    XenaryFirebase?: {
      isReady: () => boolean;
      getCurrentUser: () => FirebaseUser | null;
      getIdToken: () => string | null;
      signInWithGoogle: (remember?: boolean) => Promise<any>;
      signOut: () => Promise<void>;
      syncOrderToFirestore: typeof syncOrderToFirestore;
      syncTopupToFirestore: typeof syncTopupToFirestore;
    };
  }
}

if (typeof window !== 'undefined') {
  window.XenaryFirebase = {
    isReady: () => authReady,
    getCurrentUser: () => currentFirebaseUser || auth.currentUser,
    getIdToken: () => memoryIdToken,
    signInWithGoogle,
    signOut,
    syncOrderToFirestore,
    syncTopupToFirestore,
  };
}
