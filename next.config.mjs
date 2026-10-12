/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    // Les fonctions Vercel refusent les corps de requête de plus de 4,5 Mo : 4 Mo par défaut là-bas, 10 Mo ailleurs.
    // Défini ici pour que le navigateur et le serveur appliquent la même limite.
    NEXT_PUBLIC_MAX_UPLOAD_MB: process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || (process.env.VERCEL ? "4" : "10"),
  },
  async headers() {
    return [
      {
        // En-têtes de sécurité sur toutes les pages
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Micro et caméra : seulement pour Rodchat (appels). Rien d'autre.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Version prudente : bloque l'intégration dans un autre site et les formulaires envoyés ailleurs,
          // sans toucher aux scripts de Next.js
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        ],
      },
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
