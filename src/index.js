import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { auth, db } from './config/firebase.js';
import { requestContext } from './middleware/requestContext.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { emailVerificationCleanup } from './services/emailVerificationCleanup.js';
import authRoutes from './routes/auth.js';
import collectionRoutes from './routes/collection.js';
import wishlistRoutes from './routes/wishlist.js';
import syncRoutes from './routes/sync.js';

const app = express();
let server;

app.disable('x-powered-by');
if (env.trustProxy) {
  app.set('trust proxy', 1);
}

morgan.token('request-id', (req) => req.requestId || '-');

app.use(requestContext);
app.use(helmet());
app.use(compression());
app.use(
  morgan(
    env.nodeEnv === 'production'
      ? ':method :url :status :res[content-length] - :response-time ms req_id=:request-id'
      : 'dev'
  )
);
app.use(cors(corsOptions));
app.use(express.json({ limit: env.requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.requestBodyLimit }));

app.get('/', (req, res) => {
  res.json({
    message: 'Coin Catalog API',
    version: env.apiVersion,
    appVersion: env.appVersion,
    status: 'running',
    docs: `/api/${env.apiVersion}`,
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.get('/ready', (req, res) => {
  const ready = Boolean(db && auth);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      firebase: ready ? 'up' : 'down',
    },
  });
});

const apiBasePath = `/api/${env.apiVersion}`;
app.use(apiBasePath, apiRateLimiter);
app.use(`${apiBasePath}/auth`, authRoutes);
app.use(`${apiBasePath}/collection`, collectionRoutes);
app.use(`${apiBasePath}/wishlist`, wishlistRoutes);
app.use(`${apiBasePath}/sync`, syncRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export const startServer = () => {
  server = app.listen(env.port, () => {
    console.log(`🚀 Server running on port ${env.port}`);
    console.log(`📡 API version: ${env.apiVersion}`);
    console.log(`🌍 Environment: ${env.nodeEnv}`);

    if (env.enableEmailCleanup) {
      emailVerificationCleanup.start();
    } else {
      console.log('⏭️ Email verification cleanup service disabled by configuration');
    }
  });

  return server;
};

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  emailVerificationCleanup.stop();

  if (!server) {
    process.exit(0);
    return;
  }

  const forceShutdownTimer = setTimeout(() => {
    console.error(`Graceful shutdown timed out after ${env.shutdownTimeoutMs}ms`);
    process.exit(1);
  }, env.shutdownTimeoutMs);

  server.close((error) => {
    clearTimeout(forceShutdownTimer);
    if (error) {
      console.error('Error closing HTTP server:', error);
      process.exit(1);
      return;
    }

    console.log('HTTP server closed');
    process.exit(0);
  });
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
