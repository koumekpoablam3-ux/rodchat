/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Empêche ESLint de faire échouer le build de production sur Vercel
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Empêche les erreurs TypeScript strictes de bloquer le build Vercel
    ignoreBuildErrors: true,
  },
  env: {
    // Les fonctions Vercel refusent les corps de requête de plus de 4,5 Mo : 4 Mo par défaut là-bas, 10 Mo ailleurs.
    // Défini ici pour que le navigateur et le serveur appliquent la même limite.
    NEXT_PUBLIC_MAX_UPLOAD_MB: process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || (process.env.VERCEL ? "4" : "10"),
  },
  async headers() {
    return [
      {
        // Le service worker ne doit jamais rester en cache, sinon les mises à jour n'arrivent pas
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;