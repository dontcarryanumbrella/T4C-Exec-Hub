import { PrismaClient } from "@prisma/client";

// The database allows only a few dozen connections in total, shared by every
// serverless instance and any local dev server. Prisma's default pool grows
// with the machine's CPU count, so a busy day could use them all up and take
// the site down. Keep each pool small unless the URL already sets a limit.
function withPoolLimit(url: string | undefined): string | undefined {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  const limit = process.env.NODE_ENV === "production" ? 2 : 3;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${limit}`;
}

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = withPoolLimit(process.env.DATABASE_URL);
export const db = globalForPrisma.prisma ?? new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
