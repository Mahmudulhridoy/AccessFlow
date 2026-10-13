import prisma from "../config/db.js";
import { FINISHED_STATUSES } from "../config/scanStatus.js";

export const listByUser = (userId) =>
  prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

export const countByUser = (userId) =>
  prisma.project.count({ where: { userId } });

export const findOwned = (userId, id) =>
  prisma.project.findFirst({ where: { id, userId } });

export const create = (userId, name, url) =>
  prisma.project.create({ data: { userId, name, url } });

export const update = (id, name, url) =>
  prisma.project.update({ where: { id }, data: { name, url } });

export const remove = (id) => prisma.project.delete({ where: { id } });

export const hasActiveScan = async (projectId) => {
  const count = await prisma.scan.count({
    where: { projectId, status: { notIn: FINISHED_STATUSES } },
  });
  return count > 0;
};
