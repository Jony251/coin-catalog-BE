import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let serviceAccount;

// Попытка загрузить из JSON файла (рекомендуется)
const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');
if (existsSync(serviceAccountPath)) {
  console.log('📄 Loading Firebase credentials from serviceAccountKey.json');
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} else {
  // Fallback на переменные окружения
  console.log('🔑 Loading Firebase credentials from environment variables');
  serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };
}

let firebaseApp;
let db;
let auth;

try {
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });

  db = admin.firestore();
  auth = admin.auth();

  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization error:', error);
}

export { firebaseApp, db, auth };
export default admin;
