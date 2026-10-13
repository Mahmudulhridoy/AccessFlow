import bcrypt from "bcrypt";
import env from "../config/env.js";
import prisma from "../config/db.js";
import { upsertAdmin } from "../models/user.model.js";

const email = env.adminEmail?.trim().toLowerCase();

if (!email || !env.adminPassword) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first");
  process.exit(1);
}

await upsertAdmin(email, await bcrypt.hash(env.adminPassword, 12));
console.log(`Admin ready: ${email}`);
await prisma.$disconnect();
