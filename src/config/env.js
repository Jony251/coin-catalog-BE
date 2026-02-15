import dotenv from 'dotenv';

dotenv.config();

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export const parseCsv = (value) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;

  const normalized = String(value).trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  throw new Error(`Invalid boolean value: "${value}"`);
};

export const parseInteger = (value, options = {}) => {
  const { name = 'value', fallback, min, max } = options;
  const raw = value ?? fallback;

  if (raw === undefined || raw === null || raw === '') {
    throw new Error(`Missing required integer value for ${name}`);
  }

  const normalized = String(raw).trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`Invalid integer value for ${name}: "${raw}"`);
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer value for ${name}: "${raw}"`);
  }

  if (min !== undefined && parsed < min) {
    throw new Error(`${name} must be greater than or equal to ${min}`);
  }

  if (max !== undefined && parsed > max) {
    throw new Error(`${name} must be less than or equal to ${max}`);
  }

  return parsed;
};

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
];

const configuredOrigins = parseCsv(process.env.ALLOWED_ORIGINS);
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInteger(process.env.PORT, {
    name: 'PORT',
    fallback: 3000,
    min: 1,
    max: 65535,
  }),
  apiVersion: process.env.API_VERSION || 'v1',
  allowedOrigins: configuredOrigins.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS,
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '1mb',
  rateLimitWindowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, {
    name: 'RATE_LIMIT_WINDOW_MS',
    fallback: 15 * 60 * 1000,
    min: 1000,
  }),
  rateLimitMax: parseInteger(process.env.RATE_LIMIT_MAX, {
    name: 'RATE_LIMIT_MAX',
    fallback: 200,
    min: 1,
  }),
  maxSyncItems: parseInteger(process.env.MAX_SYNC_ITEMS, {
    name: 'MAX_SYNC_ITEMS',
    fallback: 1000,
    min: 1,
  }),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  enableEmailCleanup: parseBoolean(process.env.ENABLE_EMAIL_CLEANUP, true),
  shutdownTimeoutMs: parseInteger(process.env.SHUTDOWN_TIMEOUT_MS, {
    name: 'SHUTDOWN_TIMEOUT_MS',
    fallback: 10_000,
    min: 1000,
  }),
  appVersion: process.env.npm_package_version || 'unknown',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: firebasePrivateKey,
    webApiKey: process.env.FIREBASE_WEB_API_KEY,
  },
};

export const hasFirebaseEnvCredentials = Boolean(
  env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey
);

if (env.nodeEnv === 'production' && configuredOrigins.length === 0) {
  console.warn('[config] ALLOWED_ORIGINS is not set. Falling back to localhost defaults.');
}
