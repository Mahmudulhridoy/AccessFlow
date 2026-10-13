import prisma from "../config/db.js";

export const findOwned = (userId, id) =>
  prisma.scan.findFirst({ where: { id, project: { userId } } });

export const listByProject = (projectId) =>
  prisma.scan.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

export const create = (projectId, scannedUrl) =>
  prisma.scan.create({ data: { projectId, scannedUrl } });

export const findById = (id) => prisma.scan.findUnique({ where: { id } });

export const setStatus = (id, status) =>
  prisma.scan.update({ where: { id }, data: { status } });

export const finish = (id, data) =>
  prisma.scan.update({
    where: { id },
    data: { ...data, completedAt: new Date() },
  });

export const countSince = (userId, since) =>
  prisma.scan.count({
    where: { createdAt: { gte: since }, project: { userId } },
  });
