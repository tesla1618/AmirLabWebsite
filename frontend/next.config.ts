import type { NextConfig } from "next";

const apiUrl = new URL(
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001/api",
);
const apiPath = apiUrl.pathname.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol === "http:" ? "http" : "https",
        hostname: apiUrl.hostname,
        ...(apiUrl.port ? { port: apiUrl.port } : {}),
        pathname: `${apiPath}/assets/**`,
      },
    ],
  },
};

export default nextConfig;
