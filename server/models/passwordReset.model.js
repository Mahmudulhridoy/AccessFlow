import prisma from "../config/db.js";

export const create = (userId, tokenHash, expiresAt) =>
  prisma.passwordReset.create({ data: { userId, tokenHash, expiresAt } });

export const findByHash = (tokenHash) =>
  prisma.passwordReset.findUnique({ where: { tokenHash } });

export const recentFor = (userId, since) =>
  prisma.passwordReset.findFirst({
    where: { userId, createdAt: { gte: since } },
  });

export const invalidateOpen = (userId) =>
  prisma.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

// Marks the link as used. Only one request can win this, even if two arrive together.
export const claim = (id) =>
  prisma.passwordReset.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

// New password in, every existing login session out.
export const applyNewPassword = (userId, passwordHash) =>
  prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
