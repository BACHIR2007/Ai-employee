import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // Safety headers that cannot break the app.
  //
  // Deliberately NO Content-Security-Policy: Next.js emits inline bootstrap
  // scripts, and a CSP without a per-request nonce would either block them or
  // need 'unsafe-inline', which buys nothing here. These four headers are
  // unconditional and have no interaction with the framework's own scripts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Never let a browser guess a content type and execute it.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // This app has no third-party origins, so do not leak the full URL.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nobody may frame the demo, so a judge cannot be clickjacked.
          { key: "X-Frame-Options", value: "DENY" },
          // The demo needs no device capabilities at all.
          {
            key: "Permissions-Policy",
            value:
              "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
