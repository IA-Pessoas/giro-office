# Relatório — restante de RH no Worker

## Escopo

Implementação limitada ao restante de RH definido no brief da migração Cloudflare. O código RH foi mantido em `workers/rh-service/**`; este relatório é o artefato obrigatório fora do Worker. Não houve deploy real e não foram alterados schemas globais, gateways, serviços de TI, User ou Pessoal.

Foram preservados o envelope de resposta, autenticação, permissões mínimas, escopo por `organization_id`, validações Zod e os nomes das tabelas canônicas PostgreSQL/Supabase. O Worker usa mappings Prisma locais para os modelos necessários, sem criar campos fora do schema canônico.

## Rotas migradas

- `DELETE /rh/categories`, incluindo bloqueio de remoção quando há solicitações vinculadas e bloqueio de nomes duplicados na atualização.
- `POST|PUT|GET|DELETE /rh/score/questions`.
- `POST|PUT|GET|DELETE /rh/holidays`.
- `PUT|GET /rh/point-config` e `GET /rh/point-config/:userId`.
- `GET /rh/time-bank-releases/list`, `POST /rh/time-bank-releases` e `PUT /rh/time-bank-releases/approve`.
- `GET /rh/time-bank/summary`, `GET /rh/time-bank/summary/:userId` e `GET /rh/time-bank/overview`.

As rotas previamente existentes de categorias e notificações foram preservadas. A aprovação de lançamento do banco de horas usa `$transaction` quando disponível para manter a atualização do lançamento e do saldo atômica.

## TDD e validação

Cada comportamento novo teve teste escrito antes da implementação e RED observado. Os ciclos principais foram:

- exclusão de categoria: `404` antes da rota, GREEN depois;
- CRUD de perguntas de avaliação: `404` antes das rotas, GREEN depois;
- CRUD de feriados: `404` antes das rotas, GREEN depois;
- configuração de ponto: `404` antes das rotas, GREEN depois;
- banco de horas: `404` antes das rotas, GREEN depois;
- atomicidade da aprovação: resposta passava, mas `$transaction` não era chamado; GREEN após a correção;
- atualização de categoria duplicada: `200` em vez de `409`; GREEN após a guarda de duplicidade.

Última execução dos gates do pacote:

- `pnpm --filter @workspace/rh-worker test`: **11/11 testes passando**;
- `pnpm --filter @workspace/rh-worker typecheck`: **passou**;
- `pnpm --filter @workspace/rh-worker build`: **passou**;
- `pnpm --filter @workspace/rh-worker check`: **passou**;
- `pnpm exec wrangler deploy --dry-run` em `workers/rh-service`: **passou**, sem bindings encontrados, upload estimado de 6278.44 KiB (1973.16 KiB gzip), sem publicação;
- `pnpm graphify:update:services`: **passou**;
- `git diff --check`: **passou**.

O workspace emitiu apenas o warning preexistente de `resolutions` em `services/src/package.json`; ele não impediu os gates.

## Lacunas registradas

As partes abaixo não foram mascaradas com mocks, respostas 200 ou schema inventado:

- ponto operacional em `/rh/point`, incluindo recálculo, cálculo, resumo, ajustes de ponto e anexos;
- timesheets em `/rh/timesheets`, incluindo geração de PDF;
- solicitações e mensagens em `/rh/requests` e `/rh/messages`, incluindo leituras, anexos e URLs assinadas;
- perfil de colaborador e usuários operacionais em `/rh/profile` e `/rh/operational-users`;
- demais avaliações em `/rh/score/quarters`, `/rh/score/evaluations` e `/rh/score/nitro`;
- relatórios internos em `/internal/reporting/*`;
- jobs/Queue de notificações.

Essas rotas dependem de relações e contratos adicionais do serviço Node, do adapter de PDF e de Storage Supabase/bindings que não estão disponíveis no mínimo atual do Worker. Implementá-las exigiria decidir schema, permissões ou contrato não comprovados pelo Worker; por isso ficam explicitamente pendentes.

## Commits e estado do workspace

- `81f0a73f3 feat(rh-worker): migrate remaining RH routes` — commit RH-only contendo schema local mínimo, implementação e testes.
- Commits concorrentes de Pessoal já existentes no branch (`a0f0ec042` e `052d53523`) não foram reescritos nem modificados.
- Alterações preexistentes de `app/next-env.d.ts`, TI e User continuam fora do índice e foram preservadas.

Nenhum deploy real foi executado.
