/**
 * Ambiente dos smokes de navegador.
 *
 * O CSP da aplicação permite apenas `connect-src 'self'`, então a interface só
 * conversa com o backend pelo caminho relativo /api, que o Next reescreve para
 * API_INTERNAL_URL. Um NEXT_PUBLIC_API_URL absoluto no .env.local do ambiente
 * faz o navegador bloquear as chamadas e derruba os smokes por motivo alheio ao
 * que eles verificam — por isso o valor é fixado aqui.
 */
export function browserSmokeEnv(extra = {}) {
  return { ...process.env, NEXT_PUBLIC_API_URL: "/api", ...extra };
}
