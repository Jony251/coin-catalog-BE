# Coin Catalog Backend API

Production-oriented backend for the Coin Catalog app.

## What is production-ready now

- Security middleware (`helmet`, CORS allow-list, request body limits)
- Request correlation IDs (`X-Request-Id`)
- API rate limiting (`express-rate-limit`)
- Safer centralized error handling (no internal leaks in production)
- Liveness (`/health`) and readiness (`/ready`) endpoints
- Graceful shutdown with timeout
- Stronger payload validation for auth/collection/wishlist/sync routes
- Secure password verification for `/auth/login` via Firebase Identity Toolkit
- Docker runtime hardening (non-root user + container healthcheck)
- CI workflow for install + tests

## Requirements

- Node.js 20+
- npm 10+
- Firebase project (Admin credentials + Web API key)

## Environment setup

Create local env file:

```bash
cp .env.example .env
```

Set required variables:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_WEB_API_KEY` (required for secure `/api/v1/auth/login`)
- `ALLOWED_ORIGINS` (must include your frontend production domain)

You can also place `serviceAccountKey.json` at repository root instead of using the 3 Firebase Admin env vars.

## Run locally

```bash
npm install
npm run dev
```

Production mode:

```bash
NODE_ENV=production npm start
```

## Numista enrichment for Firestore coins

Use the script below to enrich missing coin metadata/images in the Firestore `coins` collection from Numista.

Required:

- Firebase Admin credentials (`serviceAccountKey.json` or FIREBASE\_\* env vars)
- `NUMISTA_API_KEY`

Recommended first run (no writes):

```bash
NUMISTA_API_KEY=your_key npm run coins:enrich:numista -- --dry-run --verbose
```

Write updates:

```bash
NUMISTA_API_KEY=your_key npm run coins:enrich:numista
```

Useful options:

- `--collection=<name>` (default `coins`)
- `--limit=<n>`
- `--batch-size=<n>` (max 500)
- `--enable-search` (search Numista when a doc does not contain a type ID)
- `--force` (overwrite existing top-level fields with Numista values)
- `--lang=<en|es|fr>`

## Docker

Build image:

```bash
docker build -t coin-catalog-be .
```

Run container:

```bash
docker run --env-file .env -p 3000:3000 coin-catalog-be
```

## Health checks

- `GET /health` -> process liveness + uptime
- `GET /ready` -> dependency readiness (Firebase up/down)

## API base path

`/api/v1`

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/activate-pro`
- `GET /api/v1/auth/verify`

### Collection

- `GET /api/v1/collection`
- `POST /api/v1/collection`
- `PUT /api/v1/collection/:id`
- `DELETE /api/v1/collection/:id`
- `GET /api/v1/collection/stats`

### Wishlist

- `GET /api/v1/wishlist`
- `POST /api/v1/wishlist`
- `DELETE /api/v1/wishlist/:id`

### Sync

- `POST /api/v1/sync/collection`
- `POST /api/v1/sync/wishlist`
- `GET /api/v1/sync/status`

## Frontend integration notes

For the frontend repo (`coin-catalog-FE`):

1. Store backend base URL in environment config (dev/stage/prod).
2. Include `Authorization: Bearer <idToken>` for protected routes.
3. Propagate `X-Request-Id` from responses into frontend logs for easier tracing.
4. Add client retry/backoff only for transient failures (`429`, `503`), not for validation/auth failures.
5. Point frontend production domain in backend `ALLOWED_ORIGINS`.

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs:

- `npm ci`
- `npm test`
- `node --check src/index.js`

## Quick production checklist

- [ ] `NODE_ENV=production`
- [ ] Strong `ALLOWED_ORIGINS` (no wildcards)
- [ ] Firebase credentials configured
- [ ] `FIREBASE_WEB_API_KEY` configured
- [ ] HTTPS termination in front of backend
- [ ] Log aggregation and alerting configured
- [ ] Regular dependency updates + `npm audit` review
