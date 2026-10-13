import { Router } from "express";
import { z } from "zod";
import validate from "../middleware/validate.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import * as projects from "../controllers/project.controller.js";

const router = Router();

const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(100, "Project name is too long"),
  url: z
    .string()
    .trim()
    .max(2048, "URL is too long")
    .transform((value, ctx) => {
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Enter a full URL, like https://example.com",
        });
        return z.NEVER;
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        ctx.addIssue({
          code: "custom",
          message: "Only http and https URLs are allowed",
        });
        return z.NEVER;
      }
      if (parsed.username || parsed.password) {
        ctx.addIssue({
          code: "custom",
          message: "URLs with a username or password are not allowed",
        });
        return z.NEVER;
      }
      parsed.hash = "";
      return parsed.toString();
    }),
});

router.use(requireAuth);

router.get("/", asyncHandler(projects.list));
router.post("/", validate(projectSchema), asyncHandler(projects.create));
router.get("/:id", asyncHandler(projects.get));
router.put("/:id", validate(projectSchema), asyncHandler(projects.update));
router.delete("/:id", asyncHandler(projects.remove));

export default router;
