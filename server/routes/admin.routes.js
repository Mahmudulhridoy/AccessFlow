import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as admin from "../controllers/admin.controller.js";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));

router.get("/scans/summary", asyncHandler(admin.summary));
router.get("/scans", asyncHandler(admin.listScans));

export default router;
