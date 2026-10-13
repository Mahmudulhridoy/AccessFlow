import bcrypt from "bcrypt";
import crypto from "node:crypto";
import env from "../config/env.js";
import * as User from "../models/user.model.js";
import * as Reset from "../models/passwordReset.model.js";
import { sendResetEmail } from "../services/mailer.js";

const LINK_LIFETIME = 30 * 60 * 1000;
const COOLDOWN = 60 * 1000;

const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

export async function forgotPassword(req, res) {
  const user = await User.findByEmail(req.body.email);

  // Unknown emails get the same answer, so nobody can use this form to find out who has an account.
  if (
    user &&
    !(await Reset.recentFor(user.id, new Date(Date.now() - COOLDOWN)))
  ) {
    await Reset.invalidateOpen(user.id);

    const raw = crypto.randomBytes(32).toString("hex");
    await Reset.create(
      user.id,
      hashToken(raw),
      new Date(Date.now() + LINK_LIFETIME),
    );

    const link = `${env.clientOrigin}/reset-password?token=${raw}`;
    sendResetEmail(user.email, link).catch((err) =>
      console.error("Could not send the reset email:", err.message),
    );
  }

  res.json({
    message: "If an account exists for that email, a reset link has been sent.",
  });
}

export async function resetPassword(req, res) {
  const { token, password } = req.body;
  const invalid = () =>
    res.status(400).json({
      error: "This reset link is invalid or has expired. Request a new one.",
    });

  const record = await Reset.findByHash(hashToken(token));
  if (!record || record.usedAt || record.expiresAt < new Date())
    return invalid();

  const claimed = await Reset.claim(record.id);
  if (claimed.count === 0) return invalid();

  await Reset.applyNewPassword(record.userId, await bcrypt.hash(password, 12));
  res.json({
    message: "Password updated. You can log in with your new password.",
  });
}
