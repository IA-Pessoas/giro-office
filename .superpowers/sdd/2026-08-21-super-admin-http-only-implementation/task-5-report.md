# Tarefa 5 — Consultas globais de organizações com escopo explícito

## Entrega

- Rota somente leitura: `GET /platform/organizations?page=&pageSize=&status=&search=`.
- Autorização exclusiva por `cw.session` HttpOnly com claims `platform/super_admin` e validação da sessão ativa, não revogada e não expirada no Prisma.
- Não há fallback Bearer, contexto de suporte ou mutação; a auditoria no gateway permanece para a Tarefa 6.
- Busca parametrizada em `name`, `slug` e `cnpj`, antes de `skip/take`; ordenação estável por `name`, `id`; paginação limitada a `pageSize <= 100` e offset calculado `<= 10.000`.
- A projeção segura que remove `email_created_by` pertence apenas a `listPlatform`; `GET /organizations` preserva sua projeção, schema e ordenação legados. O índice `Organization(name, id)` acompanha a ordenação global da plataforma.

## RED / GREEN

- RED do serviço: a consulta usava `where: {}` e ordenação por `created_at`, sem busca nem ordem estável.
- GREEN do serviço: busca, contagem e página usam o mesmo filtro e a ordem `name`, `id`.
- RED HTTP: `/platform/organizations` retornava 404 e não tinha operação OpenAPI.
- GREEN HTTP: cobre 200 para sessão de plataforma, 401 sem cookie, 403 para identidade organizacional e 400 para offset além do limite.

## Correção de revisão

- `listOrganizationsQuerySchema` e `OrganizationService.list` foram restaurados integralmente ao contrato legado.
- A plataforma usa `listPlatformOrganizationsQuerySchema` e `OrganizationService.listPlatform`, com busca, paginação limitada, ordenação estável e projeção segura isoladas.
- Casos persistidos de sessão revogada, expirada, inativa, com versão divergente ou hash CSRF divergente retornam 401 sem chamar `listPlatform`.
- OpenAPI documenta a enumeração exata de `status`.

## Validações

- Vitest completo de `@workspace/organization-service`: 22 testes passaram.
- Biome escopado: 8 arquivos passaram.
- `prisma validate`: schema válido.
- Typecheck de `@workspace/organization-service`: passou com `DATABASE_URL` sintética, sem conexão ou migration aplicada.
- `git diff --check`: passou.

## Smoke

- `pnpm smoke:coverage` continua bloqueado por pendências pré-existentes: `services/src` ausente do registry e três operações DELETE de `fiscal-service` sem manifesto.
- A operação nova foi isenta da cobertura de smoke enquanto não há fluxo de sessão de plataforma no runner nem publicação no gateway; esse trabalho e a auditoria são da Tarefa 6.
