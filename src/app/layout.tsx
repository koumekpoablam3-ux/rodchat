import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./globals.css";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import AppLock from "@/components/AppLock";
import SplashScreen from "@/components/SplashScreen";
import { PALETTE_COOKIE, parsePalette } from "@/lib/palette";
import { TEXT_SIZE_COOKIE, parseTextSize } from "@/lib/text-size";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "Rodchat", template: "%s · Rodchat" },
  description: "Rodchat : discute avec tes proches, depuis ton téléphone ou ton ordinateur.",
  applicationName: "Rodchat",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Rodchat", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2B1D44" },
    { media: "(prefers-color-scheme: dark)", color: "#100D18" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  const palette = parsePalette(cookies().get(PALETTE_COOKIE)?.value);
  const textSize = parseTextSize(cookies().get(TEXT_SIZE_COOKIE)?.value);
  return (
    <html
      lang="fr"
      data-theme={theme === "auto" ? undefined : theme}
      data-palette={palette === "aubergine" ? undefined : palette}
      data-textsize={textSize === "normal" ? undefined : textSize}
      suppressHydrationWarning
    >
      <head>
        {/* Déjà vue dans cette session : l'écran de démarrage est masqué avant même le premier affichage (pas de clignotement) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var d=document.documentElement;if(sessionStorage.getItem("rodchat-splash"))d.setAttribute("data-splash","off");if(localStorage.getItem("rodchat-app-lock"))d.setAttribute("data-locked","1")}catch(e){}',
          }}
        />
      </head>
      <body className="font-sans">
        <SplashScreen />
        <AppLock />
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
