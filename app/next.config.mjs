import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiInternalBase = (process.env.API_INTERNAL_URL || "http://127.0.0.1:3010").replace(/\/$/, "");
const developmentScriptSource = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data: https:",
  `script-src 'self' 'unsafe-inline'${developmentScriptSource}`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(["develop", "staging"].includes(process.env.DEPLOY_SLOT)
    ? []
    : ["upgrade-insecure-requests"]),
].join("; ");

export const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  reactStrictMode: true,
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  transpilePackages: ["@workspace/api"],
  // Os logos ja sao webp pequenos; servir direto evita depender de /_next/image no Worker.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // #1370: rotas legadas vão para as telas atuais (sem 308 permanente, para poder mudar depois).
  async redirects() {
    return [
      { source: "/home", destination: "/dashboard", permanent: false },
      { source: "/users", destination: "/administracao", permanent: false },
      { source: "/me", destination: "/configuracoes", permanent: false },
      { source: "/clients/:id/commercial", destination: "/clients/:id", permanent: false },
    ];
  },
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
