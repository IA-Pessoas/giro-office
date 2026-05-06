const apiInternalBase = (process.env.API_INTERNAL_URL || "http://127.0.0.1:3010").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@workspace/api"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
