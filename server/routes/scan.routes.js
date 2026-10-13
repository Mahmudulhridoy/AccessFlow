import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import * as scans from "../controllers/scan.controller.js";

const router = Router();

router.get(
  "/projects/:id/scans",
  requireAuth,
  asyncHandler(scans.listForProject),
);
router.post(
  "/projects/:id/scans",
  requireAuth,
  asyncHandler(scans.start),
);
router.get("/scans/:id", requireAuth, asyncHandler(scans.get));

export default router;
