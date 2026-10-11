import { NextResponse } from "next/server";

export const unauthorized = () =>
  NextResponse.json({ error: "Connecte-toi pour continuer." }, { status: 401 });

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

export const forbidden = () =>
  NextResponse.json({ error: "Tu ne fais pas partie de cette discussion." }, { status: 403 });

export const notFound = (error = "Introuvable.") => NextResponse.json({ error }, { status: 404 });

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
