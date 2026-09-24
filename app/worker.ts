interface Env {
  GATEWAY: { fetch(request: Request): Promise<Response> };
}

// Paridade com o rewrite de next.config.mjs: /api/:path* vai para o gateway como /:path*.
export function toGatewayRequest(request: Request): Request | null {
  const url = new URL(request.url);
  if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return null;
  url.pathname = url.pathname.slice("/api".length) || "/";
  return new Request(url, request);
}

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const gatewayRequest = toGatewayRequest(request);
    if (gatewayRequest) return env.GATEWAY.fetch(gatewayRequest);

    // @ts-ignore gerado por `opennextjs-cloudflare build`
    const { default: nextWorker } = await import("./.open-next/worker.js");
    return nextWorker.fetch(request, env, ctx);
  },
};
