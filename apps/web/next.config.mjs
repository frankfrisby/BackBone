/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Static export base path — served from Express at /app
  basePath: '/app',
  // Trailing slash for static export compatibility
  trailingSlash: true,
};

export default nextConfig;
