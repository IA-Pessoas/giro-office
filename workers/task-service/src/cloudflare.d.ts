// Só o que o index.ts usa de `cloudflare:node`; o pacote não depende de @cloudflare/workers-types.
declare module "cloudflare:node" {
  export function httpServerHandler(options: { port: number }): {
    fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
  };
}
