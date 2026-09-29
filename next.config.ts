import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Ensure the Prisma query engine + generated client survive `next build`
  // standalone file tracing. Without this, Railway/runtime deployments can
  // 500 on every API route with "Query engine library not found".
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/**/*", "./node_modules/@prisma/client/**/*"],
  },
};

export default nextConfig;
