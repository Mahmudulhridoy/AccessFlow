import bcrypt from "bcrypt";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import env from "../config/env.js";
import * as User from "../models/user.model.js";
import * as Token from "../models/token.model.js";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const dummyHash = bcrypt.hashSync("placeholder-password", 12);

const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/api/auth",
  secure: env.isProd,
};

const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role });

async function startSession(res, user) {
  const raw = crypto.randomBytes(48).toString("hex");
  await Token.create(user.id, hashToken(raw), new Date(Date.now() + WEEK));
  res.cookie("rt", raw, { ...cookieOptions, maxAge: WEEK });

  const accessToken = jwt.sign(
    { sub: user.id, role: user.role },
    env.jwtSecret,
    { expiresIn: "15m" },
  );
  return { accessToken, user: publicUser(user) };
}

export async function register(req, res) {
  const { email, password } = req.body;

  if (await User.findByEmail(email)) {
    return res.status(409).json({ error: "This email is already registered" });
  }

  const user = await User.create(email, await bcrypt.hash(password, 12));
  res.status(201).json(await startSession(res, user));
}

export async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findByEmail(email);
  const match = await bcrypt.compare(
    password,
    user ? user.passwordHash : dummyHash,
  );
  if (!user || !match) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  res.json(await startSession(res, user));
}

export async function refresh(req, res) {
  const raw = req.cookies?.rt;
  if (!raw) return res.status(401).json({ error: "No session" });

  const record = await Token.findByHash(hashToken(raw));
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    res.clearCookie("rt", cookieOptions);
    return res.status(401).json({ error: "Session expired" });
  }

  await Token.revoke(record.id);
  res.json(await startSession(res, record.user));
}

export async function logout(req, res) {
  const raw = req.cookies?.rt;
  if (raw) await Token.revokeByHash(hashToken(raw));
  res.clearCookie("rt", cookieOptions);
  res.status(204).end();
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ user: publicUser(user) });
}
