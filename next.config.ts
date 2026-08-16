import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // inscription.matineesdubac.fr est l'adresse donnée aux élèves : sa racine
  // ouvre directement le choix bac / brevet, pas l'accueil de l'application.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "inscription.matineesdubac.fr" }],
        destination: "/inscription",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
