import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 blocks dev-only resources (HMR, chunks) from origins other than
  // the host the dev server started with. Opening the app via 127.0.0.1 while
  // the server says localhost silently breaks hydration — the chat's send
  // handlers never attach — so allow that host in development too.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
