#!/usr/bin/env node

const NUMISTA_BASE_URL = 'https://api.numista.com/v3';
const FIRESTORE_API_BASE = 'https://firestore.googleapis.com/v1';
const SUPPORTED_LANGS = new Set(['en', 'es', 'fr', 'ru']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isBlank = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim().length === 0);

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseArgs = (argv) => {
  const options = {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    numistaApiKey: process.env.NUMISTA_API_KEY || '',
    lang: process.env.NUMISTA_LANG || 'ru',
    dryRun: false,
    verbose: false,
    limit: null,
    requestDelayMs: 120,
    maxRetries: 4,
    enableSearch: true,
    failFast: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }
    if (arg === '--disable-search') {
      options.enableSearch = false;
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
      case 'project-id':
        options.projectId = value.trim();
        break;
      case 'numista-api-key':
        options.numistaApiKey = value.trim();
        break;
      case 'lang': {
        const lang = value.trim().toLowerCase();
        if (!SUPPORTED_LANGS.has(lang)) {
          throw new Error(`Unsupported language "${value}". Supported: en, es, fr, ru`);
        }
        options.lang = lang;
        break;
      }
      case 'limit': {
        const parsed = parsePositiveInt(value);
        if (!parsed) throw new Error(`Invalid --limit value: ${value}`);
        options.limit = parsed;
        break;
      }
      case 'request-delay-ms': {
        const parsed = parsePositiveInt(value);
        if (!parsed) throw new Error(`Invalid --request-delay-ms value: ${value}`);
        options.requestDelayMs = parsed;
        break;
      }
      case 'max-retries': {
        const parsed = parsePositiveInt(value);
        if (!parsed) throw new Error(`Invalid --max-retries value: ${value}`);
        options.maxRetries = parsed;
        break;
      }
      default:
        throw new Error(`Unsupported argument: --${rawKey}`);
    }
  }

  if (!options.projectId) throw new Error('Missing project id. Set FIREBASE_PROJECT_ID or --project-id');
  if (!options.numistaApiKey) throw new Error('Missing NUMISTA_API_KEY or --numista-api-key');

  return options;
};

const decodeFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (value.arrayValue) {
    return (value.arrayValue.values || []).map((entry) => decodeFirestoreValue(entry));
  }
  if (value.mapValue) {
    const out = {};
    for (const [key, entry] of Object.entries(value.mapValue.fields || {})) {
      out[key] = decodeFirestoreValue(entry);
    }
    return out;
  }
  return null;
};

const decodeFirestoreFields = (fields = {}) => {
  const out = {};
  for (const [key, entry] of Object.entries(fields)) {
    out[key] = decodeFirestoreValue(entry);
  }
  return out;
};

const encodeFirestoreValue = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => encodeFirestoreValue(entry)).filter(Boolean),
      },
    };
  }
  if (value && typeof value === 'object') {
    const mapFields = {};
    for (const [key, entry] of Object.entries(value)) {
      const encoded = encodeFirestoreValue(entry);
      if (encoded !== undefined) mapFields[key] = encoded;
    }
    return { mapValue: { fields: mapFields } };
  }
  return undefined;
};

const buildFirestoreFields = (plainObject) => {
  const fields = {};
  for (const [key, value] of Object.entries(plainObject)) {
    const encoded = encodeFirestoreValue(value);
    if (encoded !== undefined) fields[key] = encoded;
  }
  return fields;
};

const requestJsonWithRetry = async ({ url, options = {}, maxRetries, requestDelayMs }) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      let body = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { raw: text };
        }
      }

      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const retryAfter = Number.parseInt(response.headers.get('retry-after') || '', 10);
        const delay = Number.isInteger(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : requestDelayMs * 2 ** attempt;
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const message = body?.error?.message || body?.error_message || response.statusText;
        throw new Error(`HTTP ${response.status}: ${message}`);
      }

      if (body?.error_message) {
        throw new Error(body.error_message);
      }

      return body;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      await sleep(requestDelayMs * 2 ** attempt);
    }
  }
  throw lastError || new Error('Request failed');
};

const listCollectionDocuments = async ({ projectId, collectionName, maxRetries, requestDelayMs }) => {
  const baseUrl = `${FIRESTORE_API_BASE}/projects/${projectId}/databases/(default)/documents/${collectionName}`;
  const docs = [];
  let pageToken = '';

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set('pageSize', '500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const body = await requestJsonWithRetry({
      url,
      maxRetries,
      requestDelayMs,
    });

    for (const document of body.documents || []) {
      const docId = document.name.split('/').pop();
      docs.push({
        docId,
        documentName: document.name,
        data: decodeFirestoreFields(document.fields || {}),
      });
    }

    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }

  return docs;
};

const patchDocument = async ({
  projectId,
  collectionName,
  docId,
  updates,
  maxRetries,
  requestDelayMs,
}) => {
  const url = new URL(
    `${FIRESTORE_API_BASE}/projects/${projectId}/databases/(default)/documents/${collectionName}/${encodeURIComponent(docId)}`
  );
  for (const fieldName of Object.keys(updates)) {
    url.searchParams.append('updateMask.fieldPaths', fieldName);
  }

  await requestJsonWithRetry({
    url,
    options: {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: buildFirestoreFields(updates),
      }),
    },
    maxRetries,
    requestDelayMs,
  });
};

const extractNumistaTypeId = (coin, docId) => {
  const candidates = [coin.numistaId, coin.numistaTypeId, coin?.numista?.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === 'string' && /^\d+$/.test(candidate.trim())) {
      return Number(candidate.trim());
    }
  }

  const urlCandidates = [coin.numistaUrl, coin.url, coin?.numista?.url];
  for (const candidate of urlCandidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    const match = candidate.match(/(\d{3,})(?:\.html)?(?:[/?#]|$)/);
    if (match?.[1]) return Number(match[1]);
  }

  if (typeof docId === 'string') {
    const match = docId.match(/^numista[-_].*?(\d{3,})$/i);
    if (match?.[1]) return Number(match[1]);
  }

  return null;
};

const parseDenominationSignature = (value) => {
  if (!value || typeof value !== 'string') return { value: null, unit: null };
  const normalized = value.toLowerCase().replace(',', '.');
  const numberMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  const numeric = numberMatch ? Number.parseFloat(numberMatch[1]) : null;

  let unit = null;
  if (/(руб|rouble|ruble|rubl)/.test(normalized)) unit = 'rouble';
  else if (/(коп|kopek|kopeck)/.test(normalized)) unit = 'kopek';
  else if (/(полушк|polushka)/.test(normalized)) unit = 'polushka';
  else if (/(деньг|denga)/.test(normalized)) unit = 'denga';
  else if (/(алтын|altyn)/.test(normalized)) unit = 'altyn';

  return { value: Number.isFinite(numeric) ? numeric : null, unit };
};

const getIssuerCodeByPeriod = (periodId) => {
  if (periodId === 'russian_empire') return 'russia-empire';
  if (periodId === 'ussr') return 'ancienne_urss';
  if (periodId === 'modern_russia') return 'russia';
  if (periodId === 'modern_israel') return 'israel';
  return null;
};

const scoreSearchCandidate = ({ coin, type, rulerInfo }) => {
  let score = 0;

  if (type?.category === 'coin') score += 12;
  if (type?.min_year && type?.max_year && coin.year) {
    if (coin.year >= type.min_year && coin.year <= type.max_year) score += 30;
    else if (Math.abs(coin.year - type.min_year) <= 1 || Math.abs(coin.year - type.max_year) <= 1) score += 10;
  }

  const coinDen = parseDenominationSignature(coin.denomination || coin.name);
  const typeDen = parseDenominationSignature(type?.title || '');

  if (coinDen.unit && typeDen.unit && coinDen.unit === typeDen.unit) score += 20;
  if (coinDen.value !== null && typeDen.value !== null && Math.abs(coinDen.value - typeDen.value) < 0.0001) score += 20;

  const rulerTitle = normalizeText(type?.title);
  const rulerName = normalizeText(rulerInfo?.nameEn || rulerInfo?.name || '');
  if (rulerTitle && rulerName) {
    const rulerTokens = rulerName.split(/\s+/).filter((token) => token.length > 2);
    const matchingTokens = rulerTokens.filter((token) => rulerTitle.includes(token)).length;
    score += Math.min(matchingTokens * 8, 24);
  }

  return score;
};

const selectBestTypeFromSearch = ({ coin, candidates, rulerInfo }) => {
  const ranked = candidates
    .map((type) => ({ type, score: scoreSearchCandidate({ coin, type, rulerInfo }) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  if (!best?.type?.id) return null;
  if (best.score < 52) return null;
  if (second && best.score - second.score < 8) return null;
  return best.type.id;
};

const fetchNumistaType = async ({ typeId, lang, numistaApiKey, maxRetries, requestDelayMs }) => {
  const url = new URL(`${NUMISTA_BASE_URL}/types/${typeId}`);
  url.searchParams.set('lang', lang);
  const body = await requestJsonWithRetry({
    url,
    options: {
      headers: {
        Accept: 'application/json',
        'Numista-API-Key': numistaApiKey,
        'User-Agent': 'coin-catalog-firestore-rest-enrichment/1.0',
      },
    },
    maxRetries,
    requestDelayMs,
  });
  return body;
};

const searchNumistaType = async ({
  coin,
  rulerInfo,
  lang,
  numistaApiKey,
  maxRetries,
  requestDelayMs,
}) => {
  const issuer = getIssuerCodeByPeriod(rulerInfo?.periodId);
  const url = new URL(`${NUMISTA_BASE_URL}/types`);
  url.searchParams.set('lang', lang);
  url.searchParams.set('count', '50');
  if (issuer) url.searchParams.set('issuer', issuer);
  if (coin.year) {
    url.searchParams.set('date', String(coin.year));
    url.searchParams.set('year', String(coin.year));
  }

  const query = coin.denomination || coin.name;
  if (!isBlank(query)) {
    url.searchParams.set('q', String(query));
  }

  const body = await requestJsonWithRetry({
    url,
    options: {
      headers: {
        Accept: 'application/json',
        'Numista-API-Key': numistaApiKey,
        'User-Agent': 'coin-catalog-firestore-rest-enrichment/1.0',
      },
    },
    maxRetries,
    requestDelayMs,
  });

  const types = body.types || [];
  if (!types.length) return null;
  return selectBestTypeFromSearch({ coin, candidates: types, rulerInfo });
};

const buildNumistaPayload = ({ typeData, lang }) => ({
  id: typeData.id,
  url: typeData.url,
  title: typeData.title,
  lang,
  issuer: typeData.issuer
    ? {
        code: typeData.issuer.code,
        name: typeData.issuer.name,
      }
    : null,
  years: {
    min: typeData.min_year ?? null,
    max: typeData.max_year ?? null,
  },
  value: typeData.value
    ? {
        text: typeData.value.text ?? null,
        numericValue: typeData.value.numeric_value ?? null,
        currency: typeData.value.currency
          ? {
              id: typeData.value.currency.id ?? null,
              name: typeData.value.currency.name ?? null,
              fullName: typeData.value.currency.full_name ?? null,
            }
          : null,
      }
    : null,
  shape: typeData.shape ?? null,
  composition: typeData?.composition?.text ?? null,
  weight: typeData.weight ?? null,
  size: typeData.size ?? null,
  thickness: typeData.thickness ?? null,
  orientation: typeData.orientation ?? null,
  obverse: typeData.obverse
    ? {
        description: typeData.obverse.description ?? null,
        lettering: typeData.obverse.lettering ?? null,
        picture: typeData.obverse.picture ?? null,
        thumbnail: typeData.obverse.thumbnail ?? null,
      }
    : null,
  reverse: typeData.reverse
    ? {
        description: typeData.reverse.description ?? null,
        lettering: typeData.reverse.lettering ?? null,
        picture: typeData.reverse.picture ?? null,
        thumbnail: typeData.reverse.thumbnail ?? null,
      }
    : null,
  fetchedAt: new Date().toISOString(),
});

const buildUpdates = ({ coin, typeData, lang }) => {
  const updates = {};
  const setIfMissing = (fieldName, value) => {
    if (isBlank(value)) return;
    if (isBlank(coin[fieldName])) updates[fieldName] = value;
  };

  const obverseImage = typeData?.obverse?.picture || typeData?.obverse?.thumbnail || null;
  const reverseImage = typeData?.reverse?.picture || typeData?.reverse?.thumbnail || null;
  const mainImage = obverseImage || reverseImage;

  updates.numista = buildNumistaPayload({ typeData, lang });
  updates.numistaLastSyncedAt = new Date().toISOString();

  setIfMissing('numistaId', typeData.id);
  setIfMissing('numistaTypeId', typeData.id);
  setIfMissing('numistaUrl', typeData.url);
  setIfMissing('name', typeData.title);
  setIfMissing('nameEn', lang === 'en' ? typeData.title : null);
  setIfMissing('image', mainImage);
  setIfMissing('imageObverse', obverseImage);
  setIfMissing('imageReverse', reverseImage);
  setIfMissing('obverseImage', obverseImage);
  setIfMissing('reverseImage', reverseImage);
  setIfMissing('year', typeData.min_year);
  setIfMissing('minYear', typeData.min_year);
  setIfMissing('maxYear', typeData.max_year);
  setIfMissing('denomination', typeData?.value?.text);
  setIfMissing('denominationValue', typeData?.value?.numeric_value);
  setIfMissing('currency', typeData?.value?.currency?.name);
  setIfMissing('metal', typeData?.composition?.text);
  setIfMissing('weight', typeData.weight);
  setIfMissing('diameter', typeData.size);
  setIfMissing('size', typeData.size);
  setIfMissing('thickness', typeData.thickness);
  setIfMissing('shape', typeData.shape);
  setIfMissing('orientation', typeData.orientation);
  setIfMissing('mint', typeData?.mints?.[0]?.name);
  setIfMissing('issuerName', typeData?.issuer?.name);
  setIfMissing('valueText', typeData?.value?.text);
  setIfMissing('description', typeData?.obverse?.description || typeData?.reverse?.description);

  const reference = typeData?.references?.[0];
  if (reference?.catalogue?.code && reference?.number) {
    setIfMissing('catalogNumber', `${reference.catalogue.code} ${reference.number}`);
  }

  return updates;
};

const shouldAttemptEnrichment = (coin) => {
  const hasImages =
    !isBlank(coin.obverseImage) ||
    !isBlank(coin.reverseImage) ||
    !isBlank(coin.imageObverse) ||
    !isBlank(coin.imageReverse);
  const hasNumista = !isBlank(coin.numistaId) || !isBlank(coin.numistaTypeId) || !isBlank(coin.numistaUrl);
  return !hasImages || !hasNumista;
};

const isSearchMatchConsistent = (coin, typeData) => {
  const coinYear = Number.isInteger(coin.year) ? coin.year : null;
  if (coinYear && Number.isInteger(typeData.min_year) && Number.isInteger(typeData.max_year)) {
    if (coinYear < typeData.min_year || coinYear > typeData.max_year) {
      return false;
    }
  }

  const coinDen = parseDenominationSignature(coin.denomination || coin.name);
  const typeDen = parseDenominationSignature(typeData?.value?.text || typeData?.title);
  if (coinDen.unit && typeDen.unit && coinDen.unit !== typeDen.unit) {
    return false;
  }
  if (
    coinDen.value !== null &&
    typeDen.value !== null &&
    Math.abs(coinDen.value - typeDen.value) > 0.0001
  ) {
    return false;
  }

  return true;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `[REST-Enrich] Start: project=${options.projectId}, dryRun=${options.dryRun}, lang=${options.lang}, enableSearch=${options.enableSearch}`
  );

  const [coins, rulers] = await Promise.all([
    listCollectionDocuments({
      projectId: options.projectId,
      collectionName: 'coins',
      maxRetries: options.maxRetries,
      requestDelayMs: options.requestDelayMs,
    }),
    listCollectionDocuments({
      projectId: options.projectId,
      collectionName: 'rulers',
      maxRetries: options.maxRetries,
      requestDelayMs: options.requestDelayMs,
    }),
  ]);

  const rulerById = new Map(rulers.map((entry) => [entry.docId, entry.data]));

  const stats = {
    totalCoins: coins.length,
    scanned: 0,
    updated: 0,
    wouldUpdate: 0,
    skippedComplete: 0,
    skippedNoTypeId: 0,
    skippedNoChanges: 0,
    errors: 0,
    typeResolvedByField: 0,
    typeResolvedBySearch: 0,
    numistaDetailRequests: 0,
    numistaSearchRequests: 0,
  };

  const detailCache = new Map();
  const searchCache = new Map();

  for (const entry of coins) {
    if (options.limit && stats.scanned >= options.limit) break;
    stats.scanned += 1;
    const coin = entry.data;

    if (!shouldAttemptEnrichment(coin)) {
      stats.skippedComplete += 1;
      continue;
    }

    try {
      let typeId = extractNumistaTypeId(coin, entry.docId);
      let resolvedBySearch = false;
      if (typeId) {
        stats.typeResolvedByField += 1;
      }

      if (!typeId && options.enableSearch) {
        const rulerInfo = rulerById.get(coin.rulerId) || null;
        const searchKey = `${coin.rulerId || ''}|${coin.year || ''}|${coin.denomination || ''}|${coin.name || ''}`;
        if (searchCache.has(searchKey)) {
          typeId = searchCache.get(searchKey);
        } else {
          typeId = await searchNumistaType({
            coin,
            rulerInfo,
            lang: options.lang,
            numistaApiKey: options.numistaApiKey,
            maxRetries: options.maxRetries,
            requestDelayMs: options.requestDelayMs,
          });
          stats.numistaSearchRequests += 1;
          searchCache.set(searchKey, typeId || null);
          await sleep(options.requestDelayMs);
        }

        if (typeId) stats.typeResolvedBySearch += 1;
        if (typeId) resolvedBySearch = true;
      }

      if (!typeId) {
        stats.skippedNoTypeId += 1;
        if (options.verbose) {
          console.log(`[REST-Enrich] Skip ${entry.docId}: type id not resolved`);
        }
        continue;
      }

      let typeData = detailCache.get(typeId);
      if (!typeData) {
        typeData = await fetchNumistaType({
          typeId,
          lang: options.lang,
          numistaApiKey: options.numistaApiKey,
          maxRetries: options.maxRetries,
          requestDelayMs: options.requestDelayMs,
        });
        detailCache.set(typeId, typeData);
        stats.numistaDetailRequests += 1;
        await sleep(options.requestDelayMs);
      }

      if (resolvedBySearch && !isSearchMatchConsistent(coin, typeData)) {
        stats.skippedNoTypeId += 1;
        if (options.verbose) {
          console.log(`[REST-Enrich] Skip ${entry.docId}: search match failed strict validation`);
        }
        continue;
      }

      const updates = buildUpdates({ coin, typeData, lang: options.lang });
      if (!Object.keys(updates).length) {
        stats.skippedNoChanges += 1;
        continue;
      }

      if (options.dryRun) {
        stats.wouldUpdate += 1;
        if (options.verbose) {
          console.log(`[REST-Enrich][DRY RUN] ${entry.docId} <- type ${typeId}`);
        }
        continue;
      }

      await patchDocument({
        projectId: options.projectId,
        collectionName: 'coins',
        docId: entry.docId,
        updates,
        maxRetries: options.maxRetries,
        requestDelayMs: options.requestDelayMs,
      });
      stats.updated += 1;

      if (options.verbose) {
        console.log(`[REST-Enrich] Updated ${entry.docId} using type ${typeId}`);
      }
    } catch (error) {
      stats.errors += 1;
      console.error(`[REST-Enrich] Error on ${entry.docId}: ${error.message}`);
      if (options.failFast) throw error;
    }

    if (stats.scanned % 50 === 0) {
      console.log(
        `[REST-Enrich] Progress: scanned=${stats.scanned}, updated=${stats.updated}, skippedNoTypeId=${stats.skippedNoTypeId}, errors=${stats.errors}`
      );
    }
  }

  console.log('[REST-Enrich] Done.');
  console.log(JSON.stringify(stats, null, 2));
};

main().catch((error) => {
  console.error('[REST-Enrich] Fatal:', error.message);
  process.exitCode = 1;
});
