import { Router } from "express";
import rateLimit from "express-rate-limit";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import * as scans from "../controllers/scan.controller.js";

const router = Router();

const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Too many scan requests, slow down" },
});

router.get(
  "/projects/:id/scans",
  requireAuth,
  asyncHandler(scans.listForProject),
);
router.post(
  "/projects/:id/scans",
  requireAuth,
  startLimiter,
  asyncHandler(scans.start),
);
router.get("/scans/:id", requireAuth, asyncHandler(scans.get));

export default router;
