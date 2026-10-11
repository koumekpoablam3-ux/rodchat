import { PrismaClient } from "@prisma/client";

// Une seule instance par fonction (évite d'ouvrir trop de connexions pendant le développement)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
