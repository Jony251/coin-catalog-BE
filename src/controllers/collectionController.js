import { db } from '../config/firebase.js';
import { AppError } from '../middleware/errorHandler.js';

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

const buildCollectionCoinPayload = (payload) => ({
  catalogCoinId: String(payload.catalogCoinId).trim(),
  condition: payload.condition || null,
  grade: normalizeNullableText(payload.grade),
  purchasePrice: normalizeNullableNumber(payload.purchasePrice),
  purchaseDate: normalizeNullableIsoDate(payload.purchaseDate),
  notes: normalizeNullableText(payload.notes),
  userWeight: normalizeNullableNumber(payload.userWeight),
  userDiameter: normalizeNullableNumber(payload.userDiameter),
  userObverseImage: normalizeNullableText(payload.userObverseImage),
  userReverseImage: normalizeNullableText(payload.userReverseImage),
});

const COLLECTION_UPDATABLE_FIELDS = [
  'condition',
  'grade',
  'purchasePrice',
  'purchaseDate',
  'notes',
  'userWeight',
  'userDiameter',
  'userObverseImage',
  'userReverseImage',
];

const buildCollectionUpdatePayload = (payload) => {
  const updates = {};

  for (const field of COLLECTION_UPDATABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;

    if (field === 'purchasePrice' || field === 'userWeight' || field === 'userDiameter') {
      updates[field] = normalizeNullableNumber(payload[field]);
      continue;
    }

    if (field === 'purchaseDate') {
      updates[field] = normalizeNullableIsoDate(payload[field]);
      continue;
    }

    updates[field] = field === 'condition' ? payload[field] || null : normalizeNullableText(payload[field]);
  }

  return updates;
};

export const getCollection = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    
    const collectionDoc = await db.collection('collections').doc(userId).get();
    
    if (!collectionDoc.exists) {
      return res.json({
        success: true,
        coins: [],
      });
    }

    const data = collectionDoc.data();
    
    res.json({
      success: true,
      coins: data.coins || [],
      updatedAt: data.updatedAt,
    });
  } catch (error) {
    console.error('Get collection error:', error);
    next(new AppError('Failed to get collection', 500));
  }
};

export const addCoin = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    const payload = buildCollectionCoinPayload(req.body);

    const collectionRef = db.collection('collections').doc(userId);
    const collectionDoc = await collectionRef.get();

    let coins = [];
    if (collectionDoc.exists) {
      coins = collectionDoc.data().coins || [];
    }

    const newCoin = {
      id: `uc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      ...payload,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    coins.push(newCoin);

    await collectionRef.set({
      userId,
      coins,
      updatedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      coin: newCoin,
    });
  } catch (error) {
    console.error('Add coin error:', error);
    next(new AppError('Failed to add coin', 500));
  }
};

export const updateCoin = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    const coinId = req.params.id;
    const updates = buildCollectionUpdatePayload(req.body);

    if (Object.keys(updates).length === 0) {
      return next(new AppError('No valid fields provided for update', 400));
    }

    const collectionRef = db.collection('collections').doc(userId);
    const collectionDoc = await collectionRef.get();

    if (!collectionDoc.exists) {
      return next(new AppError('Collection not found', 404));
    }

    let coins = collectionDoc.data().coins || [];
    const coinIndex = coins.findIndex(c => c.id === coinId);

    if (coinIndex === -1) {
      return next(new AppError('Coin not found', 404));
    }

    coins[coinIndex] = {
      ...coins[coinIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await collectionRef.update({
      coins,
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      coin: coins[coinIndex],
    });
  } catch (error) {
    console.error('Update coin error:', error);
    next(new AppError('Failed to update coin', 500));
  }
};

export const removeCoin = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    const coinId = req.params.id;

    const collectionRef = db.collection('collections').doc(userId);
    const collectionDoc = await collectionRef.get();

    if (!collectionDoc.exists) {
      return next(new AppError('Collection not found', 404));
    }

    let coins = collectionDoc.data().coins || [];
    const initialLength = coins.length;
    coins = coins.filter(c => c.id !== coinId);

    if (coins.length === initialLength) {
      return next(new AppError('Coin not found', 404));
    }

    await collectionRef.update({
      coins,
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Coin removed successfully',
    });
  } catch (error) {
    console.error('Remove coin error:', error);
    next(new AppError('Failed to remove coin', 500));
  }
};

export const getStats = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    
    const collectionDoc = await db.collection('collections').doc(userId).get();
    const wishlistDoc = await db.collection('wishlists').doc(userId).get();

    const collectionCoins = collectionDoc.exists ? (collectionDoc.data().coins || []) : [];
    const wishlistCoins = wishlistDoc.exists ? (wishlistDoc.data().coins || []) : [];

    const totalValue = collectionCoins.reduce((sum, coin) => {
      return sum + (Number(coin.purchasePrice) || 0);
    }, 0);

    res.json({
      success: true,
      stats: {
        collectionCount: collectionCoins.length,
        wishlistCount: wishlistCoins.length,
        totalValue,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    next(new AppError('Failed to get stats', 500));
  }
};
