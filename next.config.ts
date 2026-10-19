import type { NextConfig } from "next";

// Baseline hardening headers for every route (see
// node_modules/next/dist/docs/01-app/.../headers.md): clickjacking guard,
// MIME-sniffing guard, tight referrer, HSTS, and a permissive-but-bounded
// CSP. A nonce-based strict CSP is deliberately deferred — Next/Tailwind
// need 'unsafe-inline' for styles, and the app's BYOK chat must reach
// arbitrary user-configured providers — so connect-src stays open while
// framing, objects and base-uri stay locked down.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' blob: data:",
      "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Next 16 blocks dev-only resources (HMR, chunks) from origins other than
  // the host the dev server started with. Opening the app via 127.0.0.1 while
  // the server says localhost silently breaks hydration — the chat's send
  // handlers never attach — so allow that host in development too.
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
