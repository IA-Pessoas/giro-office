# Pesquisas mensais de uso de IA — Plano de implementação

> **Para agentes executores:** usar `superpowers:executing-plans` e concluir cada tarefa antes de seguir. Passos usam caixas de seleção para rastrear progresso.

**Objetivo:** Entregar a issue #1545 com controles mensais de uso de IA no Marketing, autorização por organização, importação segura, relatórios e dashboard.

**Arquitetura:** Persistir respostas no `marketing-service` e no Prisma, com unicidade física por organização/usuário/competência. Expor operações pelo gateway existente, reaproveitar a permissão de Marketing e ativar a página protegida com padrões visuais existentes.

**Stack:** TypeScript, Express, Zod, Prisma/PostgreSQL, Vitest, Next.js, React Query, Playwright.

**Especificação:** `docs/superpowers/specs/2026-09-28-ai-usage-surveys-design.md`

## Restrições globais

- Trabalhar somente na issue #1545 neste worktree `codex/issue-1545`.
- Preservar resposta ausente como `NULL`; não inferir integração, conhecimento, usuário ou competência.
- Derivar organização da sessão; nunca aceitar organização arbitrária no contrato público.
- Exigir nível Marketing 1 para leitura e nível 2 para mutação.
- Não executar carga real nem alterar a quarentena histórica sem export legado validado.
- Escrever e observar teste falhar antes de cada mudança comportamental de produção.
- Preservar o shell e o padrão atual do Marketing; sem redesign.

## Mapa de arquivos

- `infra/prisma/schema.prisma` e nova migration: modelo mensal com relacionamentos e índice único.
- `services/marketing-service/src/schemas/marketingAiUsageControl.schemas.ts`: contratos HTTP e domínio.
- `services/marketing-service/src/services/marketingAiUsageControlService.ts`: unicidade, lote, respostas, relatório e resumo do dashboard.
- `services/marketing-service/src/routes/marketingAiUsageControl.routes.ts`: endpoints autenticados.
- `services/marketing-service/src/openapi/spec.ts` e `src/app.ts`: contrato e montagem.
- `services/marketing-service/src/services/marketingDashboardService.ts` e schemas existentes: indicador pendente.
- `services/marketing-service/src/test/marketingAiUsageControlService.test.ts`, `marketingAiUsageControl.routes.test.ts` e `marketingDashboardService.test.ts`: regras, rotas, autorização e painel.
- `services/marketing-service/src/services/marketingAiUsageControlService.ts` e `src/test/marketingAiUsageControlService.test.ts`: associação validada, idempotência e resultados de reconciliação no mesmo serviço de controles.
- `services/gateway/src/config/disabledRoutes.ts`, `src/app.routes.test.ts`, `src/openapi/gatewaySpec.test.ts`, `src/test/modulePermissionRegression.test.ts`: liberação e proteção do prefixo Marketing.
- `scripts/all-services-smoke.manifest.mjs` e `scripts/generated/marketing-service.smoke.mjs`: contrato de smoke público.
- `app/src/modules/auth/utils/moduleAccess.ts`, `app/src/modules/auth/run-auth-tests.mjs`, `app/src/pages/marketing/index.tsx`: ativação protegida da rota.
- `app/src/modules/marketing/`: tipos, serviços, hooks e componentes do controle mensal; preservar `MarketingDashboard.tsx` como base visual.
- `app/src/modules/marketing/run-marketing-tests.mjs` e `app/package.json`: cobertura do fluxo e comando escopado.

## Tarefas

### 1. Adicionar persistência e validação do modelo

- [x] Inspecionar relações atuais de `Organization` e `User`; cobrir unicidade e vínculo organizacional nos testes.
- [x] Adicionar `MarketingAiUsageControl` com competência normalizada para o primeiro dia do mês, respostas nullable e frequência entre 1 e 10.
- [x] Criar migration com FK e índice único por `organization_id`, `user_id` e `competence`; sem editar histórico migrado.
- [x] Gerar cliente Marketing, validar schema e revisar o diff do modelo/migration.

### 2. Implementar regras e contratos HTTP com TDD

- [x] Cobrir competência inválida, pendências, duplicidade unitária, criação em lote e isolamento por organização.
- [x] Implementar schemas Zod e service; “sem integração” exige `false` explícito.
- [x] Cobrir autenticação, níveis de permissão, payload inválido, sucesso, conflito e organização forjada nas rotas.
- [x] Implementar criar unitário/lote, consultar por competência, salvar respostas e consultar relatório; organização deriva da sessão.
- [x] Garantir concorrência pelo índice único e mapear violação unitária a conflito.
- [x] Atualizar OpenAPI e montagem do `marketing-service`.

### 3. Integrar relatório e dashboard

- [x] Testar conhecimento pendente na competência corrente do fuso da organização.
- [x] Testar controles pendentes e usuários com integração explicitamente falsa, mantendo nulos como pendentes.
- [x] Implementar consultas com filtro obrigatório de organização/competência e usuários ativos elegíveis para lote.
- [x] Atualizar schemas e tipos do dashboard.

### 4. Importar com reconciliação conservadora

- [x] Criar fixtures sintéticas para vínculo único, sem vínculo, competência inválida e duplicidade.
- [x] Cobrir importação segura e ausência de gravação para registros não associáveis.
- [x] Implementar importação idempotente por ID legado canônico e competência explícita.
- [x] Enfileirar itens não associáveis para reconciliação; nenhuma carga real foi executada sem export validado.

### 5. Ativar gateway e smoke

- [x] Testar encaminhamento de `/marketing` com contexto/permissão; rotas sem permissão continuam protegidas.
- [x] Remover apenas as entradas de bloqueio geral de Marketing e atualizar os testes correspondentes.
- [x] Atualizar OpenAPI do gateway, smoke manifest e artefato gerado; preservar bloqueios não relacionados.
- [x] Rodar `pnpm smoke:coverage` e testes escopados do gateway.

### 6. Entregar interface autenticada

- [x] Atualizar teste de auth para ativar Marketing e manter `/marketing` protegido.
- [x] Criar fluxo de competência, criação individual/lote, listagem/importação e respostas com padrões existentes.
- [x] Integrar indicador no dashboard e tratar estados de carregamento, erro, vazio, conflito e sucesso.
- [x] Atualizar smoke do módulo e validar a rota navegável e as ações dos CTAs.
- [x] Rodar testes Marketing, typecheck frontend e revisar desktop/mobile.

### 7. Revisar e validar #1545

- [x] Atualizar Graphify quando disponível; os grafos locais não estavam disponíveis, então foi usada descoberta manual.
- [x] Rodar testes escopados, smoke coverage, lint, typecheck e builds dos pacotes afetados.
- [x] Executar fluxo Playwright e salvar screenshots em `output/playwright/issue-1545/`.
- [x] Fazer revisão Ponytail Full e revisão de segurança para autorização, importação e isolamento.
- [x] Inspecionar diff, validações e screenshots antes de preparar o PR para `feature/milestone-27-issues-1545-1546-1547-1548`.

## Critérios de conclusão

- Unicidade vale no banco e em operações concorrentes.
- Criação individual e em lote respeitam ativo, organização e duplicidade.
- As cinco respostas preservam o contrato e valores ainda sem resposta aparecem como pendentes.
- Importação grava somente vínculos únicos; ambiguidades ficam em reconciliação.
- Relatório e dashboard diferenciam ausência de resposta de integração explicitamente falsa.
- API, gateway e UI negam usuários sem permissão e isolam organização.
- Testes, lint, typecheck, build, smoke e fluxo no navegador têm resultados registrados.
- PR inclui critérios atendidos, evidências, validações, riscos e relação com #1545.
