/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' } : {}),
  typedRoutes: true,
};

export default nextConfig;
