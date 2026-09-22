# Relatório — restante de User no Worker

## Escopo

Implementação limitada a `workers/user-service/**`, ao lockfile necessário para a dependência Web-compatible fixada e a este relatório, comparando as rotas de User, autenticação de plataforma, usuários de plataforma e reporting interno do serviço Express. Não houve alteração em `services/**`, gateway, UI ou `app/next-env.d.ts`; alterações concorrentes fora de User foram preservadas.

## Rotas migradas

- `POST /user/session`, `POST /user/session/refresh`, `DELETE /user/session`, `GET /user/session/validate` e `GET /user/me`.
- Listagem, detalhe, permissões, atualização, desativação e fotos de usuários da organização (`/user` e `/user/:id...`), com escopo por organização, CSRF em mutações e revogação por `session_version`.
- `POST /platform/session`, `POST /platform/session/refresh`, `DELETE /platform/session`, `GET /platform/me` e `POST /platform/session/validate`.
- Usuários da plataforma: ownership transfer, criação, detalhe, permissões, departamentos, listagem, atualização, desativação e reativação.
- `POST /internal/reporting/access-context`, exigindo `REPORTS_INTERNAL_TOKEN` dedicado.
- `POST /user` e `POST /user/start-config`, com o contrato Node, validação de departamento e bootstrap legado (`organization_id: null`).

As sessões mantêm cookies de sessão/CSRF, claims, rotação de CSRF, expiração, revogação no banco e invalidação por versão. As rotas protegidas de plataforma exigem token interno, identidade encaminhada `platform`, papel `super_admin` e id do ator. Quando o gateway encaminha identidade junto com cookies, o cookie do navegador continua tendo precedência para validar a sessão e a revogação no banco.

Identidades encaminhadas agora exigem `session_id`, `session_version` e hash CSRF bem formado; organização e plataforma são conferidas contra a sessão correspondente no banco. Mutações encaminhadas exigem prova CSRF de transporte. `activeOrganizationId` só resolve quando usuário ativo, departamento e organização formam o mesmo vínculo. Consultas e mutações de usuário aceitam o legado com `organization_id` nulo somente quando o departamento pertence à organização resolvida.

O entrypoint injeta `hash-wasm@4.12.0` para Argon2id canônico e bcrypt legado (`$2a$`, `$2b$`, `$2y$`), além do adapter Supabase Storage criado exclusivamente com `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` server-side. O segredo não é retornado nem incorporado em resposta; mutações relevantes usam `AUDIT_SERVICE` por binding.

O schema Prisma mínimo foi ajustado somente para refletir tabelas existentes necessárias ao contrato: relação `Organization`–`Department`/`User` e `PlatformUser.password`. Não foi criada migration, tabela D1 ou campo fora do schema de origem.

## TDD

RED observado antes dos ajustes de produção:

- rodada de rotas de login/autorização: 15 testes, 12 passando e 3 falhando — login de organização ausente, login de plataforma sem a proteção esperada e cookie de plataforma aceito sem gateway;
- token de reporting dedicado: 15 testes, 1 falhando (`403` com `REPORTS_INTERNAL_TOKEN` configurado);
- sessão de plataforma atrás do gateway: 18 testes, 1 falhando (`401` no refresh porque o Worker priorizava os headers encaminhados e não validava o cookie).
- fotos no Worker: 17 testes, 2 falhando com `404` antes dos handlers de leitura/upload/remoção;
- suspensão de organização: 19 testes, 1 falhando com `200` antes da validação do status da organização;
- login para organização suspensa: 20 testes, 1 falhando com `200` antes da validação do vínculo ativo.
- criação/onboarding: 3 testes falhando com `404` antes das rotas; criação platform: 1 teste falhando com `501`; alteração de departamento cross-tenant: 1 teste falhando antes da validação.

GREEN observado:

- `pnpm --filter @workspace/user-worker test`: **35/35 testes passando**;
- refactor de imports/formatação com Biome e nova execução de check: **passou**.

## Validação

- `pnpm --filter @workspace/user-worker typecheck`: **passou**;
- `pnpm --filter @workspace/user-worker build`: **passou**;
- `pnpm --filter @workspace/user-worker check`: **passou**;
- `pnpm exec wrangler deploy --dry-run --config workers/user-service/wrangler.jsonc`: **passou**, upload estimado de 5935.58 KiB (1941.60 KiB gzip), apenas `AUDIT_SERVICE`, sem publicação;
- `pnpm graphify:update:services`: **passou**;
- `git diff --check`: **passou**;
- inspeção de superfície do entrypoint: **passou**; o adapter Storage recebe o service-role somente por env server-side, não o serializa nem o inclui em respostas;
- `pnpm test` na raiz: scripts passaram, mas a suíte completa foi bloqueada antes das suítes pelo `@workspace/client-service#prisma:generate`, que não consegue resolver `DATABASE_URL`. Isso é limitação de configuração externa e não foi tratado como sucesso do workspace.

## Lacunas registradas

- Não houve teste autenticado contra PostgreSQL/Supabase real nem smoke remoto do binding `AUDIT_SERVICE`; a cobertura disponível é de seam HTTP com Prisma/binding fakes.
- O adapter de auditoria é best-effort, compatível com o contrato Node atual; não há outbox transacional no escopo deste Worker.
- A instalação normal da nova dependência depende de acesso ao registry; a resolução foi fixada no `pnpm-lock.yaml` e o bundle dry-run local foi concluído, mas nenhum deploy foi feito.

## Commit

- `ade440f4 feat(user-worker): migrate remaining user routes`
- `ad4cf112 fix(user-worker): preserve organization auth checks`

Nenhum deploy ou push foi executado.
