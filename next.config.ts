import type { NextConfig } from "next";

const NGROK_DOMAIN = process.env.NGROK_DOMAIN ?? "dandy-unsent-gab.ngrok-free.dev";
const TEAMHUB_URL = process.env.NEXT_PUBLIC_TEAMHUB_URL ?? `https://${NGROK_DOMAIN}`;
const isDevelopment = process.env.NODE_ENV !== "production";
let teamhubHost = NGROK_DOMAIN;
try {
  teamhubHost = new URL(TEAMHUB_URL).host;
} catch {
  // keep default
}

const nextConfig: NextConfig = {
  // Allow HMR / dev overlay when served through ngrok (top-level in Next 16)
  allowedDevOrigins: [NGROK_DOMAIN, teamhubHost],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vietqr.app",
        pathname: "/img/**",
      },
      {
        protocol: "https",
        hostname: NGROK_DOMAIN,
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: teamhubHost,
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(isDevelopment ? [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" }] : []),
          {
            key: "Permissions-Policy",
            // Include modern features to silence Chrome "Unrecognized feature: attribution-reporting"
            value: "camera=(self), geolocation=(self), microphone=(), attribution-reporting=(), browsing-topics=()",
          },
          // Bypass ngrok free interstitial for manifest/HMR/fetch
          { key: "ngrok-skip-browser-warning", value: "true" },
        ],
      },
      {
        source: "/sw-v2.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self'; frame-ancestors 'self' https://${NGROK_DOMAIN} https://${teamhubHost};`,
          },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: `https://${NGROK_DOMAIN}` },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-SePay-Signature" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
};

export default nextConfig;
