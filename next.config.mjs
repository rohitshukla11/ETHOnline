/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The ATS SDK is an ESM/Node-only chain (did-jwt -> @scure/base) that webpack
    // cannot bundle; load it from node_modules at runtime instead.
    serverComponentsExternalPackages: [
      "@hashgraph/asset-tokenization-sdk",
      "@hashgraph/sdk",
    ],
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // wagmi's connector barrel pulls in the Base Account connector, whose
    // @coinbase/cdp-sdk dependency imports optional x402 packages we never use.
    config.externals.push(/^@x402(\/|$)/);
    return config;
  },
};

export default nextConfig;
