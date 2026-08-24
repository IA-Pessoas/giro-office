# Task 8 report

## Entrega

- Adicionado login de plataforma em `/super-admin/login`, sem manipular cookies ou tokens no navegador.
- `AuthContext` passa a carregar a identidade de plataforma apenas por `/platform/me` e expõe login, renovação e logout por endpoints de sessão.
- Adicionado `canSSRPlatformAdmin`, que encaminha o cookie recebido somente no SSR e exige `auth_kind: "platform"` e `platform_role: "super_admin"` retornados por `/platform/me`.
- Criadas verificações executáveis contra transporte legível de credenciais e mantida a suíte agregada.

## Correção pós-revisão

- O bootstrap e as operações de plataforma agora usam `platformApi`, criada por `setupAPIClient()` sem o callback de logout organizacional.
- O teste comportamental exercita `401 /user/me` seguido de `200 /platform/me`, além de `401` em refresh e logout, confirmando que o cliente de plataforma continua sem o efeito colateral de redirecionar ao login organizacional.

## Evidência TDD e validação

- RED: `corepack pnpm --filter @workspace/app run test:platform-session` falhou pela ausência de `signInPlatform`.
- GREEN: `test:platform-session`, `test:session-security` e `test:auth` passaram.
- RED/GREEN da correção: o teste falhou sem `platformApi` e passou após a separação do cliente.
- `corepack pnpm --filter @workspace/app typecheck` passou.
- O lint do pacote é um script informativo configurado pelo repositório; foi executado no fechamento.

## Observações

- Graphify não possui grafo local neste worktree; foi usado o fluxo manual previsto no `AGENTS.md`.
- As validações locais executaram em Node 24, enquanto o gate de CI da issue exige Node 22.
- O build criou artefatos temporários em `app/.next`; nenhum deles foi incluído no commit.
