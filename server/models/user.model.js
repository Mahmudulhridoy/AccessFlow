import prisma from "../config/db.js";

export const findByEmail = (email) =>
  prisma.user.findUnique({ where: { email } });

export const findById = (id) => prisma.user.findUnique({ where: { id } });

export const create = (email, passwordHash) =>
  prisma.user.create({ data: { email, passwordHash } });

export const upsertAdmin = (email, passwordHash) =>
  prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash },
    create: { email, passwordHash, role: "ADMIN" },
  });
