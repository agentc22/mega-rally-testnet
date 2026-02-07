/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/mega-rally-testnet';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath,
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
