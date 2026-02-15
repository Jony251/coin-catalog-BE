import { auth, db } from '../config/firebase.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const ensureAuthAndDatabase = (next) => {
  if (!auth || !db) {
    next(new AppError('Service unavailable: authentication not configured', 503));
    return false;
  }

  return true;
};

const mapIdentityToolkitError = (code) => {
  switch (code) {
    case 'INVALID_PASSWORD':
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_LOGIN_CREDENTIALS':
      return new AppError('Invalid email or password', 401);
    case 'USER_DISABLED':
      return new AppError('User account is disabled', 403);
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return new AppError('Too many login attempts. Try again later.', 429);
    default:
      return new AppError('Login failed', 401);
  }
};

const signInWithPassword = async (email, password) => {
  if (!env.firebase.webApiKey) {
    throw new AppError('Service unavailable: login is not configured', 503);
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.firebase.webApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    const errorCode = payload?.error?.message;
    throw mapIdentityToolkitError(errorCode);
  }

  return payload;
};

export const register = async (req, res, next) => {
  try {
    if (!ensureAuthAndDatabase(next)) return;

    const { email, password, nickname, photo } = req.body;
    const normalizedNickname = nickname.trim();
    const normalizedPhoto = typeof photo === 'string' && photo.trim() ? photo.trim() : null;

    if (!normalizedNickname || normalizedNickname.length < 3) {
      return next(new AppError('Nickname must be at least 3 characters', 400));
    }

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: normalizedNickname,
    });

    const verificationDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.collection('users').doc(userRecord.uid).set({
      email: userRecord.email,
      nickname: normalizedNickname,
      displayName: normalizedNickname,
      photo: normalizedPhoto,
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
        nickname: normalizedNickname,
        emailVerified: false,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

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
    if (!ensureAuthAndDatabase(next)) return;

    const { email, password } = req.body;
    const signInData = await signInWithPassword(email, password);

    const userRecord = await auth.getUser(signInData.localId);
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    const userData = userDoc.data();

    res.json({
      success: true,
      tokens: {
        idToken: signInData.idToken,
        refreshToken: signInData.refreshToken,
        expiresIn: Number.parseInt(signInData.expiresIn, 10) || 3600,
      },
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userData?.displayName || userRecord.displayName,
        isPro: Boolean(userData?.isPro),
        emailVerified: Boolean(userRecord.emailVerified),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    console.error('Login error:', error);
    next(new AppError('Login failed', 500));
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
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userId = req.user.uid;
    const { proCode } = req.body;

    // Проверяем код активации PRO
    const validProCodes = (process.env.PRO_ACTIVATION_CODES || '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    if (validProCodes.length === 0) {
      return next(new AppError('PRO activation is not configured', 503));
    }
    
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
    if (!db) return next(new AppError('Service unavailable: database not configured', 503));

    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) return next(new AppError('User profile not found', 404));

    const userData = userDoc.data();

    res.json({
      success: true,
      user: {
        uid: req.user.uid,
        email: req.user.email,
        displayName: userData?.displayName,
        isPro: Boolean(userData?.isPro),
      },
    });
  } catch (error) {
    next(new AppError('Verification failed', 500));
  }
};
