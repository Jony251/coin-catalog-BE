import { db, auth } from '../config/firebase.js';

/**
 * Сервис для очистки неподтвержденных пользователей
 * Удаляет пользователей, которые не подтвердили email в течение 24 часов
 */
class EmailVerificationCleanupService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * Запустить периодическую проверку (каждый час)
   */
  start() {
    if (this.isRunning) {
      console.log('Cleanup service already running');
      return;
    }

    console.log('🧹 Starting email verification cleanup service');
    this.isRunning = true;

    // Запускаем сразу
    this.cleanup();

    // Затем каждый час
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000); // 1 час
  }

  /**
   * Остановить сервис
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Email verification cleanup service stopped');
  }

  /**
   * Выполнить очистку неподтвержденных пользователей
   */
  async cleanup() {
    try {
      console.log('🔍 Checking for unverified users...');
      const now = new Date();

      // Получаем всех пользователей с истекшим сроком верификации
      const usersSnapshot = await db.collection('users')
        .where('emailVerified', '==', false)
        .where('verificationDeadline', '<=', now)
        .get();

      if (usersSnapshot.empty) {
        console.log('✅ No unverified users to delete');
        return;
      }

      console.log(`⚠️ Found ${usersSnapshot.size} unverified users to delete`);

      const deletePromises = [];

      for (const doc of usersSnapshot.docs) {
        const userData = doc.data();
        const userId = doc.id;

        console.log(`Deleting unverified user: ${userData.email} (${userId})`);

        // Удаляем из Firebase Auth
        deletePromises.push(
          auth.deleteUser(userId)
            .then(() => console.log(`✅ Deleted from Auth: ${userData.email}`))
            .catch(err => console.error(`❌ Error deleting from Auth: ${userData.email}`, err))
        );

        // Удаляем из Firestore
        deletePromises.push(
          doc.ref.delete()
            .then(() => console.log(`✅ Deleted from Firestore: ${userData.email}`))
            .catch(err => console.error(`❌ Error deleting from Firestore: ${userData.email}`, err))
        );

        // Удаляем коллекцию пользователя (если есть)
        deletePromises.push(
          db.collection('collections').doc(userId).delete()
            .catch(err => console.log(`No collection to delete for ${userData.email}`))
        );

        // Удаляем wishlist пользователя (если есть)
        deletePromises.push(
          db.collection('wishlists').doc(userId).delete()
            .catch(err => console.log(`No wishlist to delete for ${userData.email}`))
        );
      }

      await Promise.all(deletePromises);
      console.log(`✅ Cleanup completed. Deleted ${usersSnapshot.size} unverified users`);
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }

  /**
   * Проверить конкретного пользователя
   */
  async checkUser(userId) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return { exists: false };
      }

      const userData = userDoc.data();
      const now = new Date();
      const deadline = userData.verificationDeadline?.toDate?.() || new Date(userData.verificationDeadline);

      return {
        exists: true,
        emailVerified: userData.emailVerified,
        deadline: deadline,
        expired: !userData.emailVerified && deadline < now,
        timeRemaining: deadline - now,
      };
    } catch (error) {
      console.error('Error checking user:', error);
      throw error;
    }
  }
}

// Экспортируем singleton
export const emailVerificationCleanup = new EmailVerificationCleanupService();
