import prisma from "../config/db.js";

export const findOwned = (userId, id) =>
  prisma.scan.findFirst({ where: { id, project: { userId } } });

export const listByProject = (projectId) =>
  prisma.scan.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
