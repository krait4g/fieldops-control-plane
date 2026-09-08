import type { NextConfig } from "next";

const dataMode = process.env.NEXT_PUBLIC_FIELDOPS_DATA_MODE ?? "";
const apiOrigin = process.env.FIELDOPS_API_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  rewrites: async () => {
    // Transport-only rewrite. Contains no auth, authorization, domain rules,
    // DTO transformation, or mock data. Production must run in remote mode.
    if (dataMode === "remote") {
      return [
        {
          source: "/api/v1/:path*",
          destination: `${apiOrigin}/api/v1/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
