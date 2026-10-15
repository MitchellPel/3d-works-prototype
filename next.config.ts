import type { NextConfig } from "next";

const pages = process.env.PAGES === "1";
const host = process.env.HOST === "1";

const nextConfig: NextConfig = pages || host
  ? {
      output: "export",
      ...(pages ? { basePath: "/3d-works-prototype" } : {}),
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
