import jwt from "jsonwebtoken";
import env from "../config/env.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  try {
    const payload = jwt.verify(header.replace("Bearer ", ""), env.jwtSecret);
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export const requireRole = (role) => (req, res, next) => {
  if (req.user?.role !== role)
    return res.status(403).json({ error: "Forbidden" });
  next();
};
