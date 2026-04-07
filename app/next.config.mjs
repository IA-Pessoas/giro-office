import { createRequire } from 'module';
const require = createRequire(import.meta.url);
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@workspace/api"],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://192.168.1.40:3333/:path*',
      },
    ];
  },
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      
