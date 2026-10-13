import prisma from "../config/db.js";

export const create = (userId, tokenHash, expiresAt) =>
  prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

export const findByHash = (tokenHash) =>
  prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

export const revoke = (id) =>
  prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

export const revokeByHash = (tokenHash) =>
  prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
