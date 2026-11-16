/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-side Firebase Admin Auth verifier for XENARY Store.
 */

import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp({
    projectId: firebaseConfig.projectId,
  });
} else {
  adminApp = getApps()[0];
}

export const adminAuth = getAuth(adminApp);

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const cleanToken = String(idToken || '').trim();
  if (!cleanToken) {
    throw new Error('missing_id_token');
  }
  const decoded: DecodedIdToken = await adminAuth.verifyIdToken(cleanToken);
  const email = typeof decoded.email === 'string' ? decoded.email.trim() : '';
  const emailVerified = decoded.email_verified === true;
  if (!decoded.uid || !email || !emailVerified) {
    throw new Error('unverified_firebase_account');
  }
  return {
    uid: decoded.uid,
    email,
    emailVerified,
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
  };
}
