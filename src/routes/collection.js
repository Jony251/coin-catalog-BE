import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import * as collectionController from '../controllers/collectionController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', collectionController.getCollection);

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
    body('condition').optional().isIn(['poor', 'fair', 'good', 'very_good', 'excellent', 'uncirculated']),
    body('grade').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('purchasePrice').optional().isFloat({ min: 0 }),
    body('purchaseDate').optional().isISO8601(),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
    body('userWeight').optional({ nullable: true }).isFloat({ min: 0 }),
    body('userDiameter').optional({ nullable: true }).isFloat({ min: 0 }),
    body('userObverseImage').optional({ nullable: true }).isString().isLength({ max: 10000 }),
    body('userReverseImage').optional({ nullable: true }).isString().isLength({ max: 10000 }),
    validate,
  ],
  collectionController.addCoin
);

router.put(
  '/:id',
  [
    param('id').isString().trim().notEmpty().withMessage('Coin ID is required'),
    body('condition').optional().isIn(['poor', 'fair', 'good', 'very_good', 'excellent', 'uncirculated']),
    body('grade').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('purchasePrice').optional().isFloat({ min: 0 }),
    body('purchaseDate').optional().isISO8601(),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
    body('userWeight').optional({ nullable: true }).isFloat({ min: 0 }),
    body('userDiameter').optional({ nullable: true }).isFloat({ min: 0 }),
    body('userObverseImage').optional({ nullable: true }).isString().isLength({ max: 10000 }),
    body('userReverseImage').optional({ nullable: true }).isString().isLength({ max: 10000 }),
    body().custom((payload) => {
      const allowedFields = [
        'condition',
        'grade',
        'purchasePrice',
        'purchaseDate',
        'notes',
        'userWeight',
        'userDiameter',
        'userObverseImage',
        'userReverseImage',
      ];
      const hasUpdatableField = Object.keys(payload || {}).some((key) => allowedFields.includes(key));
      if (!hasUpdatableField) {
        throw new Error('At least one updatable field is required');
      }
      return true;
    }),
    validate,
  ],
  collectionController.updateCoin
);

router.delete(
  '/:id',
  [param('id').isString().trim().notEmpty().withMessage('Coin ID is required'), validate],
  collectionController.removeCoin
);

router.get('/stats', collectionController.getStats);

export default router;
