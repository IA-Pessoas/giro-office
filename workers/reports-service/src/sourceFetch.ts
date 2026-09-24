import type { ServiceBinding } from "@workspace/runtime";

/** Serviços de origem do catálogo de relatórios, alcançáveis só por Service Binding. */
export const SOURCE_SERVICES = [
  "user",
  "parcelamento",
  "client",
  "contabil",
  "task",
  "project",
  "certificate",
  "fiscal",
  "pessoal",
  "regularize",
  "ti",
  "rh",
] as const;

export type SourceService = (typeof SOURCE_SERVICES)[number];

const BINDING_HOST = /^([a-z]+)-service\.binding$/u;

export function bindingName(service: SourceService) {
  return `${service.toUpperCase()}_SERVICE` as `${Uppercase<SourceService>}_SERVICE`;
}

export function bindingUrl(service: SourceService) {
  return `https://${service}-service.binding`;
}

/**
 * Os adapters do reports-service Node chamam `fetch(url)` direto. No Worker, as URLs
 * das origens apontam para `https://<svc>-service.binding` (ver env.ts) e este fetch
 * entrega essas requisições ao binding; o resto segue para a rede.
 */
export function routeSourceFetch(
  env: Partial<Record<string, ServiceBinding | unknown>>,
  base: typeof fetch,
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const service = BINDING_HOST.exec(url.hostname)?.[1] as SourceService | undefined;
    if (!service) return base(input, init);
    const name = bindingName(service);
    const binding = env[name] as ServiceBinding | undefined;
    if (!binding) {
      return Promise.reject(new Error(`reports-service: binding ${name} não configurado.`));
    }
    return binding.fetch(input, init);
  }) as typeof fetch;
}
