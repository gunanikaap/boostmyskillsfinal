/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
};

export default nextConfig;
