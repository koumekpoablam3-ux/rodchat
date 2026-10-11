import type { Prisma } from "@prisma/client";
import type { UserLite } from "../types/chat";

export const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  about: true,
  lastSeenAt: true,
  lastSeenVisible: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function serializeUser(user: UserRow): UserLite {
  const { lastSeenVisible, ...rest } = user;
  return {
    ...rest,
    // Quelqu'un qui a masqué sa dernière connexion : personne ne la reçoit
    lastSeenAt: lastSeenVisible && user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
  };
}
