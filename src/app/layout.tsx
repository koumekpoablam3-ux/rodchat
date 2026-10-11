import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./globals.css";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
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
  return (
    <html lang="fr" data-theme={theme === "auto" ? undefined : theme}>
      <body className="font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
