import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import validate from "../middleware/validate.js";
import asyncHandler from "../middleware/asyncHandler.js";
import * as reset from "../controllers/passwordReset.controller.js";

const router = Router();

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
});

const resetSchema = z.object({
  token: z
    .string()
    .min(20, "Reset link is not valid")
    .max(200, "Reset link is not valid"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Too many attempts, try again in a few minutes" },
});

router.post(
  "/forgot-password",
  limiter,
  validate(forgotSchema),
  asyncHandler(reset.forgotPassword),
);
router.post(
  "/reset-password",
  limiter,
  validate(resetSchema),
  asyncHandler(reset.resetPassword),
);

export default router;
