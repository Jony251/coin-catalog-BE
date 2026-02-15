import { auth, db } from '../config/firebase.js';
import { AppError } from '../middleware/errorHandler.js';

export const register = async (req, res, next) => {
  try {
    if (!auth || !db) return next(new AppError('Service unavailable: authentication not configured', 503));
    const { email, password, nickname, photo } = req.body;

    if (!nickname || nickname.trim().length < 3) {
      return next(new AppError('Nickname must be at least 3 characters', 400));
    }

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: nickname,
    });

    const verificationDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.collection('users').doc(userRecord.uid).set({
      email: userRecord.email,
      nickname: nickname.trim(),
      displayName: nickname.trim(),
      photo: photo || null,
      emailVerified: false,
      verificationDeadline: verificationDeadline,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Генерируем ссылку для верификации email
    const verificationLink = await auth.generateEmailVerificationLink(email);
    
    // TODO: Отправить email с ссылкой верификации через email service
    // Для демо просто логируем
    console.log('Email verification link:', verificationLink);
    console.log('User must verify email within 24 hours or account will be deleted');

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email within 24 hours.',
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        nickname: nickname.trim(),
        emailVerified: false,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 'auth/email-already-exists') {
      return next(new AppError('Email already in use', 400));
    }
    
    if (error.code === 'auth/invalid-email') {
      return next(new AppError('Invalid email address', 400));
    }
    
    if (error.code === 'auth/weak-password') {
      return next(new AppError('Password is too weak', 400));
    }
    
    next(new AppError('Registration failed', 500));
  }
};

export const login = async (req, res, next) => {
  try {
    if (!auth || !db) return next(new AppError('Service unavailable: authentication not configured', 503));
    const { email } = req.body;

    const userRecord = await auth.getUserByEmail(email);
    
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    const userData = userDoc.data();

    res.json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userData?.displayName || userRecord.displayName,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    next(new AppError('Login failed', 401));
  }
};

export const logout = async (req, res, next) => {
  try {
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(new AppError('Logout failed', 500));
  }
};

export const activatePro = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { proCode } = req.body;

    // Проверяем код активации PRO
    const validProCodes = (process.env.PRO_ACTIVATION_CODES || '').split(',').filter(Boolean);
    
    if (!proCode || !validProCodes.includes(proCode.trim())) {
      return next(new AppError('Invalid PRO activation code', 400));
    }

    // Обновляем статус в Firestore (только бэкенд может это делать)
    await db.collection('users').doc(userId).update({
      isPro: true,
      proActivatedAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`PRO activated for user ${userId}`);

    res.json({
      success: true,
      message: 'PRO account activated successfully',
    });
  } catch (error) {
    console.error('Activate PRO error:', error);
    next(new AppError('Failed to activate PRO', 500));
  }
};

export const verify = async (req, res, next) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data();

    res.json({
      success: true,
      user: {
        uid: req.user.uid,
        email: req.user.email,
        displayName: userData?.displayName,
      },
    });
  } catch (error) {
    next(new AppError('Verification failed', 500));
  }
};
