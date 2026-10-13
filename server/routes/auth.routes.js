import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import validate from "../middleware/validate.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import * as auth from "../controllers/auth.controller.js";

const router = Router();

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email")
  .max(255);

const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(72),
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Too many attempts, try again in a minute" },
});

router.post(
  "/register",
  limiter,
  validate(registerSchema),
  asyncHandler(auth.register),
);
router.post("/login", limiter, validate(loginSchema), asyncHandler(auth.login));
router.post("/refresh", asyncHandler(auth.refresh));
router.post("/logout", asyncHandler(auth.logout));
router.get("/me", requireAuth, asyncHandler(auth.me));

export default router;
