import { db } from '../config/firebase.js';
import { AppError } from '../middleware/errorHandler.js';

export const syncCollection = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { coins } = req.body;

    const collectionRef = db.collection('collections').doc(userId);
    const collectionDoc = await collectionRef.get();
    
    // Получаем текущие монеты из Firebase
    let existingCoins = [];
    if (collectionDoc.exists) {
      existingCoins = collectionDoc.data().coins || [];
    }

    // Мержим: обновляем существующие или добавляем новые
    for (const coin of coins) {
      const coinData = {
        id: coin.id,
        catalogCoinId: coin.catalogCoinId,
        condition: coin.condition || null,
        grade: coin.grade || null,
        purchasePrice: coin.purchasePrice || null,
        purchaseDate: coin.purchaseDate || null,
        notes: coin.notes || '',
        userObverseImage: coin.userObverseImage || null,
        userReverseImage: coin.userReverseImage || null,
        userWeight: coin.userWeight || null,
        userDiameter: coin.userDiameter || null,
        isWishlist: coin.isWishlist || false,
        addedAt: coin.addedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const existingIndex = existingCoins.findIndex(
        c => c.id === coin.id || c.catalogCoinId === coin.catalogCoinId
      );

      if (existingIndex >= 0) {
        existingCoins[existingIndex] = coinData;
      } else {
        existingCoins.push(coinData);
      }
    }

    await collectionRef.set({
      userId,
      coins: existingCoins,
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Collection synced successfully',
      syncedCount: coins.length,
    });
  } catch (error) {
    console.error('Sync collection error:', error);
    next(new AppError('Failed to sync collection', 500));
  }
};

export const syncWishlist = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { coins } = req.body;

    const wishlistRef = db.collection('wishlists').doc(userId);
    
    await wishlistRef.set({
      userId,
      coins: coins.map(coin => ({
        id: coin.id,
        catalogCoinId: coin.catalogCoinId,
        priority: coin.priority || 'medium',
        notes: coin.notes || null,
        addedAt: coin.addedAt || new Date().toISOString(),
      })),
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Wishlist synced successfully',
      syncedCount: coins.length,
    });
  } catch (error) {
    console.error('Sync wishlist error:', error);
    next(new AppError('Failed to sync wishlist', 500));
  }
};

export const getSyncStatus = async (req, res, next) => {
  try {
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
