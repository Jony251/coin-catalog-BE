import { auth } from '../config/firebase.js';

export const authenticate = async (req, res, next) => {
  try {
    if (!auth) {
      return res.status(503).json({
        success: false,
        error: 'Service unavailable: authentication not configured',
      });
    }
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No token provided' 
      });
    }

    const token = authHeader.split('Bearer ')[1];
    
    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid token' 
    });
  }
};
