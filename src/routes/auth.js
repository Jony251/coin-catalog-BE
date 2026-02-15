import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
    body('password')
      .isString()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('nickname')
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Nickname must be 3-50 characters'),
    body('photo').optional({ nullable: true }).isString().isLength({ max: 2048 }),
    validate,
  ],
  authController.register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
    body('password').isString().notEmpty().withMessage('Password is required'),
    validate,
  ],
  authController.login
);

router.post('/logout', authenticate, authController.logout);

router.post(
  '/activate-pro',
  authenticate,
  [
    body('proCode')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('PRO activation code is required')
      .isLength({ max: 128 })
      .withMessage('PRO activation code is too long'),
    validate,
  ],
  authController.activatePro
);

router.get('/verify', authenticate, authController.verify);

export default router;
