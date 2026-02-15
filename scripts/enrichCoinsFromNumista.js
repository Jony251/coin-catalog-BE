#!/usr/bin/env node

const NUMISTA_BASE_URL = 'https://api.numista.com/v3';
const DEFAULT_COLLECTION = 'coins';
const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_LANG = 'en';
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_REQUEST_DELAY_MS = 250;
const SUPPORTED_LANGS = new Set(['en', 'es', 'fr']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isMissingValue = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim().length === 0);

const toPositiveInteger = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const asTokenSet = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return new Set();
  return new Set(normalized.split(/\s+/).filter(Boolean));
};

const pickFirstNonEmpty = (...values) => values.find((value) => !isMissingValue(value));

const pruneUndefinedDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefinedDeep(entry)).filter((entry) => entry !== undefined);
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      const pruned = pruneUndefinedDeep(entry);
      if (pruned !== undefined) out[key] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }

  if (value === undefined) return undefined;
  return value;
};

const parseYear = (value) => {
  if (value === undefined || value === null) return null;

  if (typeof value === 'number' && Number.isInteger(value) && value >= 500 && value <= 2100) {
    return value;
  }

  const text = String(value).trim();
  if (!text) return null;

  const directMatch = text.match(/^\d{4}$/);
  if (directMatch) {
    const parsed = Number.parseInt(directMatch[0], 10);
    return parsed >= 500 && parsed <= 2100 ? parsed : null;
  }

  const rangeMatch = text.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (rangeMatch) {
    const parsed = Number.parseInt(rangeMatch[1], 10);
    return parsed >= 500 && parsed <= 2100 ? parsed : null;
  }

  return null;
};

const extractCoinYear = (coin) => {
  const candidates = [
    coin.year,
    coin.issueYear,
    coin.mintedYear,
    coin.date,
    coin.minYear,
    coin.maxYear,
    coin?.numista?.years?.min,
    coin?.numista?.years?.max,
  ];

  for (const candidate of candidates) {
    const parsed = parseYear(candidate);
    if (parsed) return parsed;
  }

  return null;
};

const extractNumistaTypeIdFromValue = (value) => {
  if (value === undefined || value === null) return null;

  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    return toPositiveInteger(text);
  }

  if (!/numista\.com/i.test(text)) return null;

  const patterns = [
    /\/(\d{3,})(?:[/?#]|$)/i,
    /\/catalogue\/(?:pieces?|banknotes?|exonumia)(\d{3,})\.html/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const parsed = toPositiveInteger(match[1]);
      if (parsed) return parsed;
    }
  }

  return null;
};

const resolveTypeIdFromCoin = (coin, docId) => {
  const candidates = [
    coin.numistaTypeId,
    coin.numistaId,
    coin.numista_type_id,
    coin.typeId,
    coin.catalogCoinId,
    coin?.numista?.id,
    coin?.numista?.typeId,
    coin.numistaUrl,
    coin.url,
    coin?.numista?.url,
    docId,
  ];

  for (const candidate of candidates) {
    const parsed = extractNumistaTypeIdFromValue(candidate);
    if (parsed) return { typeId: parsed, source: 'field' };
  }

  return null;
};

const asNonEmptyString = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const extractIssuerText = (coin) =>
  pickFirstNonEmpty(
    asNonEmptyString(coin.issuerName),
    asNonEmptyString(coin.countryName),
    asNonEmptyString(coin.country),
    asNonEmptyString(coin?.issuer?.name),
    asNonEmptyString(coin?.numista?.issuer?.name),
    asNonEmptyString(coin.issuer)
  );

const buildSearchQuery = (coin) => {
  const parts = [
    coin.title,
    coin.name,
    coin.coinName,
    coin.nominal,
    coin.valueText,
    extractIssuerText(coin),
  ]
    .filter((entry) => !isMissingValue(entry))
    .map((entry) => String(entry).trim());

  if (!parts.length) return null;
  return Array.from(new Set(parts)).join(' ').trim();
};

const scoreSearchResult = ({ query, queryTokens, issuerHint, year, result }) => {
  let score = 0;
  const title = normalizeText(result?.title);

  if (!title) return score;
  if (title === query) score += 70;
  else if (title.includes(query)) score += 45;

  const titleTokens = asTokenSet(title);
  let tokenOverlap = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) tokenOverlap += 1;
  }
  score += Math.min(tokenOverlap * 8, 32);

  const resultIssuer = normalizeText(result?.issuer?.name);
  if (issuerHint && resultIssuer) {
    if (resultIssuer === issuerHint) score += 25;
    else if (resultIssuer.includes(issuerHint) || issuerHint.includes(resultIssuer)) score += 12;
  }

  if (year && Number.isInteger(result?.min_year) && Number.isInteger(result?.max_year)) {
    if (year >= result.min_year && year <= result.max_year) score += 30;
    else if (Math.abs(year - result.min_year) <= 2 || Math.abs(year - result.max_year) <= 2) score += 10;
  }

  if (result?.category === 'coin') score += 8;

  return score;
};

const selectBestSearchResult = (coin, types) => {
  if (!Array.isArray(types) || !types.length) return null;

  const query = normalizeText(buildSearchQuery(coin));
  if (!query) return null;

  const issuerHint = normalizeText(extractIssuerText(coin));
  const year = extractCoinYear(coin);
  const queryTokens = asTokenSet(query);

  const ranked = types
    .map((result) => ({
      result,
      score: scoreSearchResult({
        query,
        queryTokens,
        issuerHint,
        year,
        result,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUp = ranked[1];

  if (!best?.result?.id) return null;
  if (best.score < 55) return null;
  if (runnerUp && best.score - runnerUp.score < 10) return null;

  return { typeId: best.result.id, source: `search(score=${best.score})` };
};

const shouldEnrichCoin = (coin, force) => {
  if (force) return true;

  const hasName = !isMissingValue(coin.title) || !isMissingValue(coin.name) || !isMissingValue(coin?.numista?.title);
  const hasImages =
    !isMissingValue(coin.image) ||
    !isMissingValue(coin.imageObverse) ||
    !isMissingValue(coin.imageReverse) ||
    !isMissingValue(coin.obverseImage) ||
    !isMissingValue(coin.reverseImage) ||
    !isMissingValue(coin?.numista?.obverse?.picture) ||
    !isMissingValue(coin?.numista?.reverse?.picture);

  return !(hasName && hasImages);
};

const buildNumistaPayload = (typeData, lang) =>
  pruneUndefinedDeep({
    id: typeData.id,
    url: typeData.url,
    title: typeData.title,
    lang,
    objectType: typeData.object_type
      ? {
          id: typeData.object_type.id,
          name: typeData.object_type.name,
        }
      : undefined,
    issuer: typeData.issuer
      ? {
          code: typeData.issuer.code,
          name: typeData.issuer.name,
        }
      : undefined,
    years: {
      min: typeData.min_year,
      max: typeData.max_year,
    },
    value: typeData.value
      ? {
          text: typeData.value.text,
          numericValue: typeData.value.numeric_value,
          currency: typeData.value.currency
            ? {
                id: typeData.value.currency.id,
                name: typeData.value.currency.name,
                fullName: typeData.value.currency.full_name,
              }
            : undefined,
        }
      : undefined,
    shape: typeData.shape,
    composition: typeData?.composition?.text,
    weight: typeData.weight,
    size: typeData.size,
    thickness: typeData.thickness,
    orientation: typeData.orientation,
    obverse: typeData.obverse
      ? {
          description: typeData.obverse.description,
          lettering: typeData.obverse.lettering,
          picture: typeData.obverse.picture,
          thumbnail: typeData.obverse.thumbnail,
          pictureCopyright: typeData.obverse.picture_copyright,
          pictureCopyrightUrl: typeData.obverse.picture_copyright_url,
        }
      : undefined,
    reverse: typeData.reverse
      ? {
          description: typeData.reverse.description,
          lettering: typeData.reverse.lettering,
          picture: typeData.reverse.picture,
          thumbnail: typeData.reverse.thumbnail,
          pictureCopyright: typeData.reverse.picture_copyright,
          pictureCopyrightUrl: typeData.reverse.picture_copyright_url,
        }
      : undefined,
    fetchedAt: new Date().toISOString(),
  });

const buildFirestoreUpdatePayload = ({ coin, typeData, options }) => {
  const nowIso = new Date().toISOString();
  const update = {
    numista: buildNumistaPayload(typeData, options.lang),
    numistaLastSyncedAt: nowIso,
  };

  const maybeSet = (fieldName, value) => {
    if (isMissingValue(value)) return;
    if (options.force || isMissingValue(coin[fieldName])) {
      update[fieldName] = value;
    }
  };

  const obverseImage = pickFirstNonEmpty(typeData?.obverse?.picture, typeData?.obverse?.thumbnail);
  const reverseImage = pickFirstNonEmpty(typeData?.reverse?.picture, typeData?.reverse?.thumbnail);
  const mainImage = pickFirstNonEmpty(obverseImage, reverseImage);

  maybeSet('numistaTypeId', typeData.id);
  maybeSet('numistaId', typeData.id);
  maybeSet('numistaUrl', typeData.url);
  maybeSet('title', typeData.title);
  maybeSet('name', typeData.title);
  if (options.lang === 'en') {
    maybeSet('nameEn', typeData.title);
  }
  maybeSet('image', mainImage);
  maybeSet('imageObverse', obverseImage);
  maybeSet('imageReverse', reverseImage);
  maybeSet('obverseImage', obverseImage);
  maybeSet('reverseImage', reverseImage);
  maybeSet('obverseThumbnail', typeData?.obverse?.thumbnail);
  maybeSet('reverseThumbnail', typeData?.reverse?.thumbnail);
  maybeSet('year', typeData.min_year);
  maybeSet('minYear', typeData.min_year);
  maybeSet('maxYear', typeData.max_year);
  maybeSet('denomination', typeData?.value?.text);
  maybeSet('denominationValue', typeData?.value?.numeric_value);
  maybeSet('currency', typeData?.value?.currency?.name);
  maybeSet('metal', typeData?.composition?.text);
  maybeSet('weight', typeData.weight);
  maybeSet('diameter', typeData.size);
  maybeSet('size', typeData.size);
  maybeSet('thickness', typeData.thickness);
  maybeSet('shape', typeData.shape);
  maybeSet('orientation', typeData.orientation);
  maybeSet('composition', typeData?.composition?.text);
  maybeSet('mint', typeData?.mints?.[0]?.name);
  maybeSet(
    'catalogNumber',
    typeData?.references?.[0]?.catalogue?.code && typeData?.references?.[0]?.number
      ? `${typeData.references[0].catalogue.code} ${typeData.references[0].number}`
      : undefined
  );
  maybeSet('issuerName', typeData?.issuer?.name);
  maybeSet('valueText', typeData?.value?.text);
  maybeSet('description', pickFirstNonEmpty(typeData?.obverse?.description, typeData?.reverse?.description));

  return pruneUndefinedDeep(update) || {};
};

const fetchWithRetry = async ({ url, options, maxRetries, requestDelayMs }) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, options);

      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const retryAfter = Number.parseInt(response.headers.get('retry-after') || '', 10);
        const delay = Number.isInteger(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : requestDelayMs * 2 ** attempt;
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      await sleep(requestDelayMs * 2 ** attempt);
    }
  }

  throw lastError || new Error('Request failed');
};

const callNumista = async ({ path, query = {}, numistaApiKey, maxRetries, requestDelayMs }) => {
  const url = new URL(`${NUMISTA_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (!isMissingValue(value)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchWithRetry({
    url,
    options: {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Numista-API-Key': numistaApiKey,
        'User-Agent': 'coin-catalog-backend-numista-enrichment/1.0',
      },
    },
    maxRetries,
    requestDelayMs,
  });

  const raw = await response.text();
  let body = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Numista API returned invalid JSON for ${path}`);
    }
  }

  if (!response.ok || body?.error_message) {
    const details = body?.error_message || response.statusText || 'Unknown API error';
    throw new Error(`Numista API request failed (${response.status}): ${details}`);
  }

  return body;
};

const loadFirestoreDb = async () => {
  const firebaseModule = await import('../src/config/firebase.js');
  return firebaseModule.db;
};

const commitBatchUpdates = async (dbInstance, items) => {
  if (!items.length) return;
  const batch = dbInstance.batch();
  for (const item of items) {
    batch.set(item.ref, item.update, { merge: true });
  }
  await batch.commit();
  items.length = 0;
};

const printHelp = () => {
  console.log(`
Numista coin enrichment for Firestore.

Usage:
  node scripts/enrichCoinsFromNumista.js [options]

Options:
  --collection=<name>         Firestore collection to scan (default: coins)
  --limit=<n>                 Max number of coin docs to process
  --batch-size=<n>            Firestore batch size (default: 200, max: 500)
  --lang=<en|es|fr>           Numista response language (default: en)
  --dry-run                   Do not write to Firestore, only print what would change
  --force                     Overwrite existing top-level fields with Numista values
  --enable-search             Try Numista text search when no type ID is present
  --request-delay-ms=<n>      Delay after Numista requests (default: 250ms)
  --max-retries=<n>           Retries for transient Numista errors (default: 4)
  --verbose                   Print per-coin logs
  --fail-fast                 Stop immediately on first coin-level error
  --help                      Print this help

Environment:
  NUMISTA_API_KEY             Required Numista API key
`);
};

const parseArgs = (argv) => {
  const options = {
    collection: DEFAULT_COLLECTION,
    limit: null,
    batchSize: DEFAULT_BATCH_SIZE,
    lang: DEFAULT_LANG,
    dryRun: false,
    force: false,
    enableSearch: false,
    requestDelayMs: DEFAULT_REQUEST_DELAY_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    verbose: false,
    failFast: false,
    showHelp: false,
    numistaApiKey: process.env.NUMISTA_API_KEY || '',
  };

  for (const arg of argv) {
    if (arg === '--help') {
      options.showHelp = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--enable-search') {
      options.enableSearch = true;
      continue;
    }
    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }
    if (arg === '--fail-fast') {
      options.failFast = true;
      continue;
    }
    if (!arg.startsWith('--') || !arg.includes('=')) {
      throw new Error(`Unsupported argument: ${arg}`);
    }

    const [rawKey, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=');

    switch (rawKey) {
      case 'collection':
        options.collection = value.trim() || DEFAULT_COLLECTION;
        break;
      case 'limit':
        options.limit = toPositiveInteger(value);
        if (!options.limit) throw new Error(`Invalid --limit value: ${value}`);
        break;
      case 'batch-size':
        options.batchSize = toPositiveInteger(value);
        if (!options.batchSize || options.batchSize > 500) {
          throw new Error(`--batch-size must be an integer in range 1..500 (got: ${value})`);
        }
        break;
      case 'lang':
        options.lang = value.trim().toLowerCase();
        if (!SUPPORTED_LANGS.has(options.lang)) {
          throw new Error(`Unsupported --lang value "${value}". Supported: en, es, fr`);
        }
        break;
      case 'request-delay-ms':
        options.requestDelayMs = toPositiveInteger(value);
        if (!options.requestDelayMs) throw new Error(`Invalid --request-delay-ms value: ${value}`);
        break;
      case 'max-retries':
        options.maxRetries = toPositiveInteger(value);
        if (!options.maxRetries) throw new Error(`Invalid --max-retries value: ${value}`);
        break;
      case 'numista-api-key':
        options.numistaApiKey = value.trim();
        break;
      default:
        throw new Error(`Unsupported argument: --${rawKey}`);
    }
  }

  return options;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (options.showHelp) {
    printHelp();
    return;
  }

  if (!options.numistaApiKey) {
    throw new Error('NUMISTA_API_KEY is missing. Provide it via env var or --numista-api-key option.');
  }

  const db = await loadFirestoreDb();
  if (!db) {
    throw new Error(
      'Firestore is not configured. Provide serviceAccountKey.json or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.'
    );
  }

  console.log(
    `[Numista] Starting enrichment: collection=${options.collection}, dryRun=${options.dryRun}, force=${options.force}, enableSearch=${options.enableSearch}`
  );

  const snapshot = await db.collection(options.collection).get();
  const docs = snapshot.docs;

  const stats = {
    scanned: 0,
    updated: 0,
    wouldUpdate: 0,
    skippedComplete: 0,
    skippedNoTypeId: 0,
    skippedNoChanges: 0,
    errors: 0,
    numistaDetailRequests: 0,
    numistaSearchRequests: 0,
  };

  const pendingUpdates = [];
  const detailCache = new Map();
  const searchCache = new Map();

  for (const doc of docs) {
    if (options.limit && stats.scanned >= options.limit) break;
    stats.scanned += 1;

    const coin = doc.data() || {};

    if (!shouldEnrichCoin(coin, options.force)) {
      stats.skippedComplete += 1;
      continue;
    }

    try {
      let resolved = resolveTypeIdFromCoin(coin, doc.id);

      if (!resolved && options.enableSearch) {
        const query = buildSearchQuery(coin);
        const year = extractCoinYear(coin);
        const searchCacheKey = `${query || ''}::${year || ''}`;

        if (query) {
          if (searchCache.has(searchCacheKey)) {
            resolved = searchCache.get(searchCacheKey);
          } else {
            const searchPayload = await callNumista({
              path: '/types',
              query: {
                lang: options.lang,
                q: query,
                date: year || undefined,
                count: 10,
                page: 1,
              },
              numistaApiKey: options.numistaApiKey,
              maxRetries: options.maxRetries,
              requestDelayMs: options.requestDelayMs,
            });
            stats.numistaSearchRequests += 1;
            resolved = selectBestSearchResult(coin, searchPayload.types || []);
            searchCache.set(searchCacheKey, resolved || null);
            await sleep(options.requestDelayMs);
          }
        }
      }

      if (!resolved?.typeId) {
        stats.skippedNoTypeId += 1;
        if (options.verbose) {
          console.log(`[Numista] Skip ${doc.id}: no Numista type ID found`);
        }
        continue;
      }

      let typeData = detailCache.get(resolved.typeId);
      if (!typeData) {
        typeData = await callNumista({
          path: `/types/${resolved.typeId}`,
          query: { lang: options.lang },
          numistaApiKey: options.numistaApiKey,
          maxRetries: options.maxRetries,
          requestDelayMs: options.requestDelayMs,
        });
        detailCache.set(resolved.typeId, typeData);
        stats.numistaDetailRequests += 1;
        await sleep(options.requestDelayMs);
      }

      const update = buildFirestoreUpdatePayload({ coin, typeData, options });
      if (!Object.keys(update).length) {
        stats.skippedNoChanges += 1;
        continue;
      }

      if (options.dryRun) {
        stats.wouldUpdate += 1;
        if (options.verbose) {
          console.log(
            `[Numista][DRY RUN] ${doc.id} <- type=${resolved.typeId} source=${resolved.source} fields=${Object.keys(update).join(', ')}`
          );
        }
        continue;
      }

      pendingUpdates.push({
        ref: doc.ref,
        update,
      });

      if (pendingUpdates.length >= options.batchSize) {
        await commitBatchUpdates(db, pendingUpdates);
        stats.updated += options.batchSize;
      }

      if (options.verbose) {
        console.log(`[Numista] Prepared update for ${doc.id} using type=${resolved.typeId} (${resolved.source})`);
      }
    } catch (error) {
      stats.errors += 1;
      console.error(`[Numista] Error while processing ${doc.id}:`, error.message);
      if (options.failFast) throw error;
    }

    if (stats.scanned % 25 === 0) {
      console.log(
        `[Numista] Progress: scanned=${stats.scanned}, updated=${stats.updated}, dryRunUpdates=${stats.wouldUpdate}, errors=${stats.errors}`
      );
    }
  }

  if (!options.dryRun && pendingUpdates.length) {
    const remaining = pendingUpdates.length;
    await commitBatchUpdates(db, pendingUpdates);
    stats.updated += remaining;
  }

  console.log('[Numista] Enrichment complete.');
  console.log(
    JSON.stringify(
      {
        ...stats,
        totalDocsRead: docs.length,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error('[Numista] Fatal error:', error.message);
  process.exitCode = 1;
});
