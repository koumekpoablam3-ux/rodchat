import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth";

// Protège les pages /chat et /join : sans session valide, retour à la connexion
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const userId = token ? await verifyToken(token) : null;

  if (!userId) {
    const url = req.nextUrl.clone();
    const wanted = req.nextUrl.pathname;
    url.pathname = "/login";
    url.search = "";
    // Après la connexion on revient là où la personne voulait aller (lien d'invitation, par exemple)
    if (wanted !== "/chat") url.searchParams.set("next", wanted);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/join/:path*"],
};
