import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('nickname').trim().isLength({ min: 3 }).withMessage('Nickname must be at least 3 characters'),
    body('photo').optional().isString(),
    validate,
  ],
  authController.register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  authController.login
);

router.post('/logout', authenticate, authController.logout);

router.post(
  '/activate-pro',
  authenticate,
  [
    body('proCode').notEmpty().withMessage('PRO activation code is required'),
    validate,
  ],
  authController.activatePro
);

router.get('/verify', authenticate, authController.verify);

export default router;
