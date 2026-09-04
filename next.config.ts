import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // metaapi.cloud-sdk's package.json "exports" resolves ESM imports to its
  // browser bundle (dists/esm-web, which references `window` at module
  // scope) regardless of serverExternalPackages — force it to the plain
  // CJS build instead, which loads cleanly under Node.
  turbopack: {
    resolveAlias: {
      "metaapi.cloud-sdk": "./node_modules/metaapi.cloud-sdk/dist/index.js",
    },
  },
};

export default nextConfig;
