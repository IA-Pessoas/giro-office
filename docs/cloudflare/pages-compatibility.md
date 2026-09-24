# Compatibilidade da UI com Cloudflare Pages

## Evidência local

Executado em 2026-09-22 na branch `cloudflare-migration`:

```text
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/giro_ci pnpm --filter @workspace/app build
```

Resultado: build Next.js 16.3.3 passou, com TypeScript e otimização de produção.

- 43 páginas-fonte usam `getServerSideProps` ou `getInitialProps`.
- O build gera rotas `ƒ` server-rendered para a maior parte da aplicação.
- `app/next.config.mjs` usa `output: "standalone"`.
- O artefato gerado contém `app/.next/standalone/app/server.js`.
- Não existe `app/out` para publicação estática.
- O rewrite atual mantém `/api/*` no mesmo origin e aponta para `API_INTERNAL_URL` no servidor.

## Decisão

Export estático puro não é compatível com o estado atual. A migração para Pages deve usar Advanced Mode com um UI Worker/adapter SSR, mantendo:

1. cookies e `/api/*` no mesmo origin;
2. Gateway Worker por Service Binding para as rotas de API;
3. fallback de runtime para as páginas SSR e paths dinâmicos;
4. browser smoke de login, sessão, upload, relatório, chat e logout antes do cutover.

Nenhum projeto Pages foi criado nem publicado para esta aplicação; o build adapter e o smoke de preview continuam pendentes.
