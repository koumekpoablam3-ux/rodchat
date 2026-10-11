import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ user });
}
