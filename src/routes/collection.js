import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import * as collectionController from '../controllers/collectionController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', collectionController.getCollection);

router.post(
  '/',
  [
    body('catalogCoinId').notEmpty().withMessage('catalogCoinId is required'),
    body('condition').optional().isIn(['poor', 'fair', 'good', 'very_good', 'excellent', 'uncirculated']),
    body('grade').optional().trim(),
    body('purchasePrice').optional().isFloat({ min: 0 }),
    body('purchaseDate').optional().isISO8601(),
    body('notes').optional().trim(),
    validate,
  ],
  collectionController.addCoin
);

router.put(
  '/:id',
  [
    body('condition').optional().isIn(['poor', 'fair', 'good', 'very_good', 'excellent', 'uncirculated']),
    body('grade').optional().trim(),
    body('purchasePrice').optional().isFloat({ min: 0 }),
    body('purchaseDate').optional().isISO8601(),
    body('notes').optional().trim(),
    validate,
  ],
  collectionController.updateCoin
);

router.delete('/:id', collectionController.removeCoin);

router.get('/stats', collectionController.getStats);

export default router;
