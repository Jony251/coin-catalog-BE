import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env, hasFirebaseEnvCredentials } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');

const loadServiceAccount = () => {
  if (existsSync(serviceAccountPath)) {
    console.log('📄 Loading Firebase credentials from serviceAccountKey.json');
    return JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  }

  if (hasFirebaseEnvCredentials) {
    console.log('🔑 Loading Firebase credentials from environment variables');
    return {
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: env.firebase.privateKey,
    };
  }

  return null;
};

let firebaseApp;
let db;
let auth;

try {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount?.projectId) {
    throw new Error('Firebase credentials missing: set serviceAccountKey.json or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });

  db = admin.firestore();
  auth = admin.auth();

  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization error:', error);
  console.warn('⚠️ Firebase-backed endpoints will return 503 until credentials are configured.');
  firebaseApp = undefined;
  db = undefined;
  auth = undefined;
}

export { firebaseApp, db, auth };
export default admin;
