import { auth } from '../config/firebase.js';
import { AppError } from './errorHandler.js';

export const authenticate = async (req, res, next) => {
  try {
    if (!auth) {
      return next(new AppError('Service unavailable: authentication not configured', 503));
    }
    const authHeader = req.get('authorization');
    
    if (!authHeader) {
      return next(new AppError('Unauthorized: No token provided', 401));
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new AppError('Unauthorized: Invalid authorization format', 401));
    }

    const decodedToken = await auth.verifyIdToken(token);
    if (!decodedToken?.uid) {
      return next(new AppError('Unauthorized: Invalid token payload', 401));
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
    
    next();
  } catch (error) {
    if (error?.code === 'auth/id-token-expired') {
      return next(new AppError('Unauthorized: Token expired', 401));
    }

    console.error('Authentication error:', error);
    return next(new AppError('Unauthorized: Invalid token', 401));
  }
};
