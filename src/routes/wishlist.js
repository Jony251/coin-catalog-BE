import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import * as wishlistController from '../controllers/wishlistController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', wishlistController.getWishlist);

router.post(
  '/',
  [
    body('catalogCoinId').notEmpty().withMessage('catalogCoinId is required'),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('notes').optional().trim(),
    validate,
  ],
  wishlistController.addToWishlist
);

router.delete('/:id', wishlistController.removeFromWishlist);

export default router;
