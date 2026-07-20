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
  },
};

export default nextConfig;
