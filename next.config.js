/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_STATIC_EXPORT: process.env.STATIC_EXPORT === '1' ? '1' : '0' },
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  // STATIC_EXPORT=1 builds a plain static site (GitHub Pages); pages/api is removed in that build.
  ...(process.env.STATIC_EXPORT === '1' ? { output: 'export', trailingSlash: true } : {}),
  // Preview builds can go to another folder so the running :8973 server is never overwritten.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

module.exports = nextConfig;
