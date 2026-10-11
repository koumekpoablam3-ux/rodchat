import { NextResponse } from "next/server";
import { badRequest, unauthorized } from "@/lib/api";
import { deleteAvatarByUrl, readAvatarUpload, saveAvatar } from "@/lib/avatars";
import { broadcastUser } from "@/lib/profile";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";
import { serializeUser, userSelect } from "@/lib/users";

// Ma photo de profil : le corps de la requête est l'image brute (déjà réduite par le navigateur)
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  if (!rateLimit(`avatar:${userId}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Patiente un peu avant de changer à nouveau ta photo." }, { status: 429 });
  }

  const upload = await readAvatarUpload(req);
  if (!upload.ok) return badRequest(upload.error);

  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  const url = await saveAvatar(upload);
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url }, select: userSelect });
  await deleteAvatarByUrl(previous?.avatarUrl ?? null);

  await broadcastUser(userId);
  return NextResponse.json({ user: serializeUser(user) });
}

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null }, select: userSelect });
  await deleteAvatarByUrl(previous?.avatarUrl ?? null);

  await broadcastUser(userId);
  return NextResponse.json({ user: serializeUser(user) });
}
