import type { NextConfig } from "next";

const pages = process.env.PAGES === "1";

const nextConfig: NextConfig = pages
  ? {
      output: "export",
      basePath: "/3d-works-prototype",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
