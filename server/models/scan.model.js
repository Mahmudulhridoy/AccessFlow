import prisma from "../config/db.js";
import { ACTIVE_STATUSES } from "../config/scanStatus.js";

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

export const markStaleFailed = () =>
  prisma.scan.updateMany({
    where: { status: { in: ACTIVE_STATUSES } },
    data: {
      status: "FAILED",
      errorCode: "INTERNAL",
      errorMessage: "The server restarted while this scan was running.",
      completedAt: new Date(),
    },
  });

export const adminList = async ({ status, errorCode, page, pageSize }) => {
  const where = {};
  if (status) where.status = status;
  if (errorCode) where.errorCode = errorCode;

  const [total, scans] = await Promise.all([
    prisma.scan.count({ where }),
    prisma.scan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        project: { select: { name: true, user: { select: { email: true } } } },
      },
    }),
  ]);
  return { total, scans };
};

export const countByStatus = () =>
  prisma.scan.groupBy({ by: ["status"], _count: { _all: true } });

export const countByErrorCode = () =>
  prisma.scan.groupBy({
    by: ["errorCode"],
    where: { errorCode: { not: null } },
    _count: { _all: true },
  });
