import { db } from '../config/firebase.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const generateEntityId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

const normalizeNullableText = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

const normalizeNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeNullableIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildCollectionCoin = (coin) => ({
  id: normalizeNullableText(coin.id) || generateEntityId('uc'),
  catalogCoinId: String(coin.catalogCoinId).trim(),
  condition: coin.condition || null,
  grade: normalizeNullableText(coin.grade),
  purchasePrice: normalizeNullableNumber(coin.purchasePrice),
  purchaseDate: normalizeNullableIsoDate(coin.purchaseDate),
  notes: normalizeNullableText(coin.notes),
  userObverseImage: normalizeNullableText(coin.userObverseImage),
  userReverseImage: normalizeNullableText(coin.userReverseImage),
  userWeight: normalizeNullableNumber(coin.userWeight),
  userDiameter: normalizeNullableNumber(coin.userDiameter),
  isWishlist: Boolean(coin.isWishlist),
  addedAt: normalizeNullableIsoDate(coin.addedAt) || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const buildWishlistCoin = (coin) => ({
  id: normalizeNullableText(coin.id) || generateEntityId('wl'),
  catalogCoinId: String(coin.catalogCoinId).trim(),
  priority: coin.priority || 'medium',
  notes: normalizeNullableText(coin.notes),
  addedAt: normalizeNullableIsoDate(coin.addedAt) || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const syncCollection = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    const { coins } = req.body;
    if (!Array.isArray(coins)) return next(new AppError('coins must be an array', 400));
    if (coins.length > env.maxSyncItems) {
      return next(new AppError(`coins array exceeds max size (${env.maxSyncItems})`, 413));
    }

    const collectionRef = db.collection('collections').doc(userId);
    const collectionDoc = await collectionRef.get();
    
    const existingCoins = collectionDoc.exists ? collectionDoc.data().coins || [] : [];
    const mergedById = new Map(existingCoins.map((coin) => [coin.id || coin.catalogCoinId, coin]));

    for (const incomingCoin of coins) {
      const coin = buildCollectionCoin(incomingCoin);
      const mergeKey = coin.id || coin.catalogCoinId;
      const existingCoin = mergedById.get(mergeKey);
      mergedById.set(mergeKey, {
        ...(existingCoin || {}),
        ...coin,
        // Preserve original addedAt for existing entities.
        addedAt: existingCoin?.addedAt || coin.addedAt,
      });
    }

    await collectionRef.set({
      userId,
      coins: Array.from(mergedById.values()),
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Collection synced successfully',
      syncedCount: coins.length,
      totalCount: mergedById.size,
    });
  } catch (error) {
    console.error('Sync collection error:', error);
    next(new AppError('Failed to sync collection', 500));
  }
};

export const syncWishlist = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    const { coins } = req.body;
    if (!Array.isArray(coins)) return next(new AppError('coins must be an array', 400));
    if (coins.length > env.maxSyncItems) {
      return next(new AppError(`coins array exceeds max size (${env.maxSyncItems})`, 413));
    }

    const wishlistRef = db.collection('wishlists').doc(userId);
    const normalizedCoins = coins.map((coin) => buildWishlistCoin(coin));
    const deduplicatedByCatalogId = new Map(
      normalizedCoins.map((coin) => [coin.catalogCoinId, coin])
    );
    
    await wishlistRef.set({
      userId,
      coins: Array.from(deduplicatedByCatalogId.values()),
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Wishlist synced successfully',
      syncedCount: coins.length,
      totalCount: deduplicatedByCatalogId.size,
    });
  } catch (error) {
    console.error('Sync wishlist error:', error);
    next(new AppError('Failed to sync wishlist', 500));
  }
};

export const getSyncStatus = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    
    const collectionDoc = await db.collection('collections').doc(userId).get();
    const wishlistDoc = await db.collection('wishlists').doc(userId).get();

    res.json({
      success: true,
      status: {
        collection: {
          exists: collectionDoc.exists,
          lastSync: collectionDoc.exists ? collectionDoc.data().updatedAt : null,
          itemCount: collectionDoc.exists ? (collectionDoc.data().coins || []).length : 0,
        },
        wishlist: {
          exists: wishlistDoc.exists,
          lastSync: wishlistDoc.exists ? wishlistDoc.data().updatedAt : null,
          itemCount: wishlistDoc.exists ? (wishlistDoc.data().coins || []).length : 0,
        },
      },
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    next(new AppError('Failed to get sync status', 500));
  }
};
