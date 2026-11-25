import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import asyncHandler from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { feedbackSchema } from '../services/aiFeedback.js';
import * as scans from '../controllers/scan.controller.js';

const router = Router();

const feedbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many ratings, slow down' },
});

const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many scan requests, slow down' },
});

router.get('/projects/:id/scans', requireAuth, asyncHandler(scans.listForProject));
router.post('/projects/:id/scans', requireAuth, startLimiter, asyncHandler(scans.start));
router.get('/scans/:id', requireAuth, asyncHandler(scans.get));
router.get('/scans/:id/findings', requireAuth, asyncHandler(scans.findings));
router.get('/scans/:id/compare/:otherId', requireAuth, asyncHandler(scans.compare));

router.post('/findings/:id/feedback', requireAuth, feedbackLimiter, validate(feedbackSchema), asyncHandler(scans.feedback));

export default router;
