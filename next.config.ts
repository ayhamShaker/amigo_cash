import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Prisma's driver adapter and argon2 are native/server-only packages.
  serverExternalPackages: ["@node-rs/argon2", "pg"],
  async headers() {
    // API responses never get cached by browsers or CDNs.
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
