import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "cache-control", value: "no-cache, no-store, must-revalidate" },
          { key: "service-worker-allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "same-origin" },
          { key: "x-frame-options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
