import { db } from '../config/firebase.js';
import { AppError } from '../middleware/errorHandler.js';

export const getWishlist = async (req, res, next) => {
  try {
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
      id: `wl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      catalogCoinId,
      priority: priority || 'medium',
      notes: notes || null,
      addedAt: new Date().toISOString(),
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
    const userId = req.user.uid;
    const coinId = req.params.id;

    const wishlistRef = db.collection('wishlists').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    if (!wishlistDoc.exists) {
      return next(new AppError('Wishlist not found', 404));
    }

    let coins = wishlistDoc.data().coins || [];
    coins = coins.filter(c => c.id !== coinId);

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
