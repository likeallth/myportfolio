import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sqlite3", "sqlite"],
};

export default nextConfig;
