/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The authenticated E2E suite (npm run test:e2e:auth) builds + serves a
  // production bundle to avoid the dev server's growing on-demand webpack cache
  // (which can exhaust memory across the long serial run). It sets this env so the
  // build lands in an isolated dir and never clobbers the interactive dev `.next`.
  ...(process.env.E2E_AUTH_DIST ? { distDir: ".next-e2e-auth" } : {}),
  // `pg` is a Node-only package; keep it external to the server bundle.
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: {
      // OLX archive uploads can be large; keep a bounded, explicit limit.
      bodySizeLimit: "50mb",
    },
    // Requests pass through Clerk middleware, which buffers the body up to this
    // limit (default 10MB) — anything larger is truncated, breaking the multipart
    // parse of large OLX uploads (MC03 ~39MB). Match the archive-safety cap so the
    // importer, not the middleware, decides what's too big.
    middlewareClientMaxBodySize: "100mb",
  },
  /**
   * Baseline security headers applied to every response. These are broadly
   * compatible and do NOT include a Content-Security-Policy — a strict CSP needs
   * the deployed Clerk domains and is tracked as a UAT follow-up in
   * docs/security/security-review.md. HSTS is intentionally omitted here (added
   * at the HTTPS edge in a real deployment, not in local/dev).
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
