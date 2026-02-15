import { db } from '../config/firebase.js';
import { AppError } from '../middleware/errorHandler.js';

const normalizeNullableText = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

export const getWishlist = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    
    const wishlistDoc = await db.collection('wishlists').doc(userId).get();
    
    if (!wishlistDoc.exists) {
      return res.json({
        success: true,
        coins: [],
      });
    }

    const data = wishlistDoc.data();
    
    res.json({
      success: true,
      coins: data.coins || [],
      updatedAt: data.updatedAt,
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    next(new AppError('Failed to get wishlist', 500));
  }
};

export const addToWishlist = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    const { catalogCoinId, priority, notes } = req.body;

    const wishlistRef = db.collection('wishlists').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    let coins = [];
    if (wishlistDoc.exists) {
      coins = wishlistDoc.data().coins || [];
    }

    const existingCoin = coins.find(c => c.catalogCoinId === catalogCoinId);
    if (existingCoin) {
      return next(new AppError('Coin already in wishlist', 400));
    }

    const newCoin = {
      id: `wl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      catalogCoinId: String(catalogCoinId).trim(),
      priority: priority || 'medium',
      notes: normalizeNullableText(notes),
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    coins.push(newCoin);

    await wishlistRef.set({
      userId,
      coins,
      updatedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      coin: newCoin,
    });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    next(new AppError('Failed to add to wishlist', 500));
  }
};

export const removeFromWishlist = async (req, res, next) => {
  try {
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    const coinId = req.params.id;

    const wishlistRef = db.collection('wishlists').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    if (!wishlistDoc.exists) {
      return next(new AppError('Wishlist not found', 404));
    }

    let coins = wishlistDoc.data().coins || [];
    const initialLength = coins.length;
    coins = coins.filter(c => c.id !== coinId);

    if (coins.length === initialLength) {
      return next(new AppError('Coin not found', 404));
    }

    await wishlistRef.update({
      coins,
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Coin removed from wishlist',
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    next(new AppError('Failed to remove from wishlist', 500));
  }
};
