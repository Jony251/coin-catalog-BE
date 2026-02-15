import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import * as wishlistController from '../controllers/wishlistController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', wishlistController.getWishlist);

router.post(
  '/',
  [
    body('catalogCoinId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('catalogCoinId is required')
      .isLength({ max: 120 })
      .withMessage('catalogCoinId is too long'),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
    validate,
  ],
  wishlistController.addToWishlist
);

router.delete(
  '/:id',
  [param('id').isString().trim().notEmpty().withMessage('Coin ID is required'), validate],
  wishlistController.removeFromWishlist
);

export default router;
