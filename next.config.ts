import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fuer die Windows-Fassung (siehe desktop/): standalone legt einen server.js
  // samt der tatsaechlich benutzten Abhaengigkeiten ab, der ohne npm install
  // startet. Fuer den Docker-Betrieb aendert das nichts.
  output: "standalone",
  // Uploads laufen über Server Actions bzw. Route Handler - Default (1 MB) ist zu klein
  // fuer Auftrags-PDFs.
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  // Hinter dem Caddy-Proxy laeuft die App auf http. Die Origin-Pruefung von
  // Server Actions vergleicht Origin gegen X-Forwarded-Host - das setzt der
  // Caddyfile-Eintrag, deshalb ist hier nichts weiter noetig.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
