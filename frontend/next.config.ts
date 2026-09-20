import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep a production build from replacing assets used by a running dev server.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // Allow the hotspot host used to preview the development server on another device.
  allowedDevOrigins: process.env.NODE_ENV === 'development' ? ['172.20.10.2'] : undefined,
};

export default nextConfig;
