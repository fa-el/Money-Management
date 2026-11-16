import type { NextConfig } from "next";

// URL backend NestJS. Browser memanggil /api/* di origin frontend, lalu Next.js
// meneruskannya ke backend — cookie sesi httpOnly tetap first-party.
const API_URL = process.env.API_URL || "http://localhost:4000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
