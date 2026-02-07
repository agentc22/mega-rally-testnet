/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath,
  // Prevent Next from walking up to a different lockfile/workspace root.
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
