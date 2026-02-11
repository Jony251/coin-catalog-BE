import { db } from '../config/firebase.js';
import { AppError } from '../middleware/errorHandler.js';

export const getCollection = async (req, res, next) => {
  try {
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
    const userId = req.user.uid;
    const { catalogCoinId, condition, grade, purchasePrice, purchaseDate, notes, userWeight, userDiameter, userObverseImage, userReverseImage } = req.body;

    const collectionRef = db.collection('collections').doc(userId);
    const collectionDoc = await collectionRef.get();

    let coins = [];
    if (collectionDoc.exists) {
      coins = collectionDoc.data().coins || [];
    }

    const newCoin = {
      id: `uc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      catalogCoinId,
      condition: condition || null,
      grade: grade || null,
      purchasePrice: purchasePrice || null,
      purchaseDate: purchaseDate || null,
      notes: notes || null,
      userWeight: userWeight || null,
      userDiameter: userDiameter || null,
      userObverseImage: userObverseImage || null,
      userReverseImage: userReverseImage || null,
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
    const userId = req.user.uid;
    const coinId = req.params.id;
    const updates = req.body;

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
    const userId = req.user.uid;
    const coinId = req.params.id;

    const collectionRef = db.collection('collections').doc(userId);
    const collectionDoc = await collectionRef.get();

    if (!collectionDoc.exists) {
      return next(new AppError('Collection not found', 404));
    }

    let coins = collectionDoc.data().coins || [];
    coins = coins.filter(c => c.id !== coinId);

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
    const userId = req.user.uid;
    
    const collectionDoc = await db.collection('collections').doc(userId).get();
    const wishlistDoc = await db.collection('wishlists').doc(userId).get();

    const collectionCoins = collectionDoc.exists ? (collectionDoc.data().coins || []) : [];
    const wishlistCoins = wishlistDoc.exists ? (wishlistDoc.data().coins || []) : [];

    const totalValue = collectionCoins.reduce((sum, coin) => {
      return sum + (coin.purchasePrice || 0);
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
