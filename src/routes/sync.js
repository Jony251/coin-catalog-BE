import express from 'express';
import { body } from 'express-validator';
import { env } from '../config/env.js';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import * as syncController from '../controllers/syncController.js';

const router = express.Router();

router.use(authenticate);

router.post(
  '/collection',
  [
    body('coins')
      .isArray({ max: env.maxSyncItems })
      .withMessage(`coins must be an array with at most ${env.maxSyncItems} items`),
    body('coins.*.catalogCoinId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('catalogCoinId is required for each coin'),
    body('coins.*.id').optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
    body('coins.*.notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('coins.*.priority').optional({ nullable: true }).isIn(['low', 'medium', 'high']),
    validate,
  ],
  syncController.syncCollection
);

router.post(
  '/wishlist',
  [
    body('coins')
      .isArray({ max: env.maxSyncItems })
      .withMessage(`coins must be an array with at most ${env.maxSyncItems} items`),
    body('coins.*.catalogCoinId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('catalogCoinId is required for each coin'),
    body('coins.*.id').optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
    body('coins.*.notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('coins.*.priority').optional({ nullable: true }).isIn(['low', 'medium', 'high']),
    validate,
  ],
  syncController.syncWishlist
);

router.get('/status', syncController.getSyncStatus);

export default router;
