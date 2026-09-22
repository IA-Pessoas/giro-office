# Relatório — restante de RH no Worker

## Atualização 2026-09-22 — branch `cf/rh-worker-remainder`

Esta rodada fechou as lacunas de rota listadas mais abaixo. Não houve deploy nem push.

### Rotas migradas nesta rodada

Mesmos paths, métodos, status, Zod (importado de `@workspace/rh-service/src/schemas`), envelope `createSuccessResponse` e níveis de permissão do Node. `requireRhPermission` do Worker exige `claims.permission` e `claims.modules.rh`. Onde o Node usa `canManageRh`/`getRhPermissionLevel`, o Worker usa o nível RH repassado pelo gateway. Todas as consultas são escopadas por `organization_id` da identidade repassada.

| Área | Rotas |
|---|---|
| Ponto | `GET /rh/point`, `GET /rh/point/me/today`, `GET /rh/point/summary`, `POST /rh/point/register`, `POST /rh/point/recalculate`, `POST /rh/point/:pointId/calculate` |
| Ajustes de ponto | `GET /rh/point/adjustment/requests`, `POST /rh/point/adjustment/request` (201), `PUT /rh/point/adjustment/approve`, `PUT .../reject`, `PUT .../approve-bulk`, `POST /rh/point/adjustment/retroactive` (201), `POST /rh/point/adjustment/:requestId/attachment` (multipart) |
| Perfil | `GET/PUT /rh/profile/colaborator`, `GET /rh/profile/colaborator/list`, `GET/POST/PUT/DELETE /rh/profile/contact`, `GET/PUT /rh/profile/allergy` |
| Usuários operacionais | `GET /rh/operational-users` (RH 3 ou qualquer módulo do catálogo ≥ 1, como no Node) |
| Solicitações | `POST/GET/PUT/DELETE /rh/requests`, `GET /rh/requests/:id` |
| Mensagens | `POST /rh/messages` (JSON ou multipart com anexo), `GET /rh/messages?requestId=` (URL assinada de 300 s) |
| Score | `GET /rh/score/evaluations/pending`, `POST /rh/score/evaluations/submit`, `POST /rh/score/quarters/generate`, `PATCH /rh/score/quarters/nitro`, `GET /rh/score/quarters/me`, `GET /rh/score/quarters/:id`, `PUT /rh/score/nitro/update` |
| Folhas de ponto | `POST /rh/timesheets`, `PUT /rh/timesheets/rebuild`, `PUT .../reopen`, `PUT .../sign`, `GET /rh/timesheets`, `GET /rh/timesheets/:id`, `GET /rh/timesheets/:id/pdf` |

Conferido com `rg "/rh/" app/src`: todo path que a UI chama existe no Worker, inclusive os quatro que davam 404 (`/rh/requests`, `/rh/score/evaluations/pending`, `/rh/timesheets`, `/rh/operational-users?module=...&department_id=...`).

### Como foi portado

- Os services do Node foram copiados para `workers/rh-service/src/services/` com a lógica e as mensagens intactas. A única mudança estrutural: o singleton `prismaClient` virou dependência de construtor, com um client por requisição via Hyperdrive (`withWorkerPrisma`). Importar os services do Node direto não funciona, porque `integrations/prisma.ts` e `config/env.ts` leem `process.env` e `import.meta.url` no import.
- O schema Prisma do Worker agora copia do canônico os modelos usados (User, Permission, Department, pontos, solicitações, mensagens, leituras, notificações, score, folhas), mantendo só as relações entre modelos incluídos. `src/schemaParity.test.ts` (cópia do user-service) garante as colunas `@updatedAt`.
- Fuso da organização: o Worker não carrega o modelo `Organization`, então `pointService` e `timeSheetService` leem `organizations.timezone` com `$queryRaw` parametrizado, com o mesmo 404 e o mesmo fallback do Node.
- Anexos: `@supabase/supabase-js` saiu, e os anexos usam `createSupabaseStorageClient` de `@workspace/runtime`. Paths de objeto, validação de path, expiração e mensagens são as mesmas do Node. Sem `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, a resposta é 503, como no Node.
- PDF: `pdfkit` 0.19.1 (já estava no lockfile) pelo build `pdfkit/js/pdfkit.standalone.js`. Ele não compila WASM nem usa eval no caminho usado e traz as fontes embutidas. Verificado no workerd com `wrangler dev --local`: gera `%PDF-1.3` com texto acentuado, linhas e imagem PNG. Armadilha: o bundle tem um shim próprio de `Buffer`, então a imagem da assinatura vai como ArrayBuffer exato. Passar um Buffer do Node cai em `fs.readFileSync` e quebra.

### Validação

- `pnpm --filter @workspace/rh-worker test`: **98/98** em 8 arquivos. Toda rota nova tem um caso de sucesso e um de erro ou permissão, e o RED foi observado antes de cada implementação (404 no stub).
- `typecheck`, `check` (biome), `build` e `prisma validate`: **passaram**.
- `pnpm exec wrangler deploy --dry-run --outdir <tmp>`: **passou**. Upload de 7947.33 KiB (2011.99 KiB gzip), binding `HYPERDRIVE`, sem publicação.
- Smoke local com `wrangler dev --local`: o bundle sobe no workerd. `/health` responde 200, identidade com RH 0 recebe 403, e uma rota com banco chega ao Prisma (falha de conexão esperada, sem banco local).

### Secrets e vars novos (só nomes)

- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. São necessários para os anexos de ajuste de ponto e de mensagens; sem eles, essas rotas respondem 503.
- Vars opcionais: `RH_POINT_ADJUSTMENT_BUCKET` (padrão `rh-point-adjustments`), `RH_REQUEST_MESSAGE_BUCKET` (padrão `rh-request-messages`), `POINT_MIN_INTERVAL_MINUTES` (padrão 30).
- Nenhum binding novo, e o gateway não mudou.

### Pendências

- `/internal/reporting/*` não foi migrado, porque estava fora do escopo desta rodada. Depende do catálogo de relatórios e do grant HMAC (`REPORTS_INTERNAL_TOKEN`/`REPORTS_GRANT_SECRET`).
- Jobs/Queue de notificações continuam pendentes, pelo mesmo motivo de antes.
- Pequeno desvio no multipart: um campo de arquivo inesperado não gera o 400 "Campo de arquivo inesperado." do multer. Os demais erros de upload (tipo, tamanho, assinatura) mantêm status e mensagem.
- O PDF completo de várias páginas foi testado no vitest (Node). No workerd, o smoke cobriu os primitivos que o layout usa (texto, linhas, imagem), mas não a rota com banco real.

## Escopo

Implementação limitada ao restante de RH definido no brief da migração Cloudflare. O código RH foi mantido em `workers/rh-service/**`; este relatório é o artefato obrigatório fora do Worker. Não houve deploy real e não foram alterados schemas globais, gateways, serviços de TI, User ou Pessoal.

Foram preservados o envelope de resposta, autenticação, permissões mínimas, escopo por `organization_id`, validações Zod e os nomes das tabelas canônicas PostgreSQL/Supabase. O Worker usa mappings Prisma locais para os modelos necessários, sem criar campos fora do schema canônico.

## Correções da revisão

O commit local `963555fd` (`fix(rh-worker): harden category and auth boundaries`) corrigiu:

- `DELETE /rh/categories`: removeu o delegate inexistente `prisma.rhRequest.count`; a regra de segurança agora consulta a tabela canônica `rh.requests` com `SELECT EXISTS` parametrizado via `$queryRaw`, sem inventar delegate ou modelo no Prisma mínimo do Worker.
- Exclusão de categoria: preserva o resultado legado `{ message: "Categoria removida com sucesso" }` dentro do envelope compartilhado e continua recusando categorias com solicitações vinculadas.
- Banco de horas: normaliza `date_from` para `00:00:00.000Z` e `date_to` para `23:59:59.999Z`, usando `TimeUtils.getUtcDayBounds`, como no serviço canônico.
- Autorização: exige simultaneamente `claims.permission` e `claims.modules.rh` no nível mínimo da rota.
- Fronteira: `workers_dev:false` e autenticação binding-only por `INTERNAL_SERVICE_TOKEN`; JWT Bearer e sessão cookie diretos são rejeitados pelo Worker. O gateway continua sendo a fronteira que valida CSRF antes do encaminhamento.
- Entrada/logs: JSON malformado retorna 400; o `onError` serializa a resposta compartilhada e registra somente método, path, status, nome do erro e request-id, sem body, headers, tokens ou mensagem bruta.

## TDD e validação da correção

Os RED observados antes da implementação foram:

- exclusão de categoria retornava 500 ao usar um mock Prisma fiel sem `rhRequest`;
- `permission=3` com `modules.rh=0` retornava 200;
- JWT Bearer e `cw.session` válidos acessavam o Worker diretamente;
- datas intradiárias eram encaminhadas sem limites UTC;
- JSON malformado retornava 500.

Após as implementações mínimas, o Worker ficou GREEN com 15/15 testes, cobrindo também vínculo existente, envelope legado, escopo de organização e respostas de erro serializadas.

Gates executados:

- `pnpm --filter @workspace/rh-worker test`: **passou, 15/15**;
- `pnpm --filter @workspace/rh-worker typecheck`: **passou**;
- `pnpm --filter @workspace/rh-worker build`: **passou**;
- `pnpm --filter @workspace/rh-worker check`: **passou**;
- `pnpm --filter @workspace/rh-worker exec prisma validate --schema prisma/schema.prisma`: **passou**;
- `pnpm graphify:update:services`: **passou**; grafo atualizado para 9305 nós e 16952 arestas, sem visualização HTML por exceder o limite local;
- `pnpm exec wrangler deploy --dry-run` em `workers/rh-service`: **passou**, sem bindings encontrados, sem publicação;
- `git diff --check`: **passou**;
- hooks do commit: **passaram**, supply-chain com 0 findings.

A suíte do serviço canônico foi iniciada para comparação: sem o client Prisma gerado, 19 suítes falharam no import e 23 passaram (110 testes). A tentativa autorizada de gerar o client canônico foi bloqueada por `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`; nenhuma credencial ou placeholder foi inventado. Portanto, o resultado canônico completo permanece não confirmado por falta de configuração local.

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

## Lacunas registradas (rodada anterior — fechadas em `cf/rh-worker-remainder`, exceto relatórios internos e jobs)

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

- `963555fd fix(rh-worker): harden category and auth boundaries` — commit local das correções desta revisão; não houve push ou deploy.
- `81f0a73f3 feat(rh-worker): migrate remaining RH routes` — commit RH-only contendo schema local mínimo, implementação e testes.
- Commits concorrentes de Pessoal já existentes no branch (`a0f0ec042` e `052d53523`) não foram reescritos nem modificados.
- Alterações preexistentes de `app/next-env.d.ts`, TI e User continuam fora do índice e foram preservadas.

Nenhum deploy real foi executado.
