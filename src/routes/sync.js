import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import * as syncController from '../controllers/syncController.js';

const router = express.Router();

router.use(authenticate);

router.post(
  '/collection',
  [
    body('coins').isArray().withMessage('coins must be an array'),
    validate,
  ],
  syncController.syncCollection
);

router.post(
  '/wishlist',
  [
    body('coins').isArray().withMessage('coins must be an array'),
    validate,
  ],
  syncController.syncWishlist
);

router.get('/status', syncController.getSyncStatus);

export default router;
