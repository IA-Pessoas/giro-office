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
- `services/marketing-service/src/services/marketingAiUsageImportService.ts` e `src/test/marketingAiUsageImportService.test.ts`: associação validada, idempotência e resultados de reconciliação.
- `services/gateway/src/config/disabledRoutes.ts`, `src/app.routes.test.ts`, `src/openapi/gatewaySpec.test.ts`, `src/test/modulePermissionRegression.test.ts`: liberação e proteção do prefixo Marketing.
- `scripts/all-services-smoke.manifest.mjs` e `scripts/generated/marketing-service.smoke.mjs`: contrato de smoke público.
- `app/src/modules/auth/utils/moduleAccess.ts`, `app/src/modules/auth/run-auth-tests.mjs`, `app/src/pages/marketing/index.tsx`: ativação protegida da rota.
- `app/src/modules/marketing/`: tipos, serviços, hooks e componentes do controle mensal; preservar `MarketingDashboard.tsx` como base visual.
- `app/src/modules/marketing/run-marketing-tests.mjs` e `app/package.json`: cobertura do fluxo e comando escopado.

## Tarefas

### 1. Adicionar persistência e validação do modelo

- [ ] Inspecionar relações atuais de `Organization` e `User`; escrever primeiro teste verificável de unicidade e vínculo organizacional no padrão existente.
- [ ] Adicionar `MarketingAiUsageControl` com competência normalizada para o primeiro dia do mês, respostas nullable e frequência entre 1 e 10.
- [ ] Criar migration com FK e índice único por `organization_id`, `user_id` e `competence`; não editar histórico migrado.
- [ ] Gerar cliente Marketing, validar schema e confirmar diff restrito ao modelo/migration.

### 2. Implementar regras e contratos HTTP com TDD

- [ ] Escrever testes de service para competência inválida, respostas pendentes, duplicidade unitária, criação em lote e isolamento por organização; confirmar falhas esperadas.
- [ ] Implementar schemas Zod e service mínimo para os comportamentos testados; respostas “sem integração” exigem `false` explícito.
- [ ] Escrever testes de rotas para sessão, permissão ausente, organização ausente, payload inválido, sucesso e conflito; confirmar falhas esperadas.
- [ ] Implementar criar unitário/lote, consultar por competência, salvar respostas e consultar relatório; corpo não contém filtro de organização.
- [ ] Acrescentar teste de concorrência lógica ou retorno de conflito ao receber violação do índice único.
- [ ] Atualizar OpenAPI e montagem do `marketing-service`.

### 3. Integrar relatório e dashboard

- [ ] Escrever testes de dashboard para conhecimento pendente na competência corrente do fuso da organização.
- [ ] Testar resumo de controles sem resposta e usuários com integração explicitamente falsa, mantendo nulos como pendentes.
- [ ] Implementar queries com filtro obrigatório de organização e competência, incluindo usuários ativos elegíveis para lote.
- [ ] Atualizar schemas e a interface/tipos do dashboard.

### 4. Importar com reconciliação conservadora

- [ ] Criar fixtures sintéticas com vínculo único, sem vínculo, vínculo ambíguo, competência inválida e duplicidade.
- [ ] Testar primeiro o resultado de cada classe, inclusive ausência de gravação para linhas ambíguas.
- [ ] Implementar importador idempotente para export normalizado e mapeamento explícito entre usuário legado e usuário canônico.
- [ ] Emitir reconciliação legível para linhas não associadas e não executar carga real sem export validado.

### 5. Ativar gateway e smoke

- [ ] Testar que `/marketing` é encaminhado com contexto/permissão; rotas sem permissão continuam negadas.
- [ ] Remover apenas as entradas de bloqueio geral de Marketing, atualizando os testes que afirmam indisponibilidade.
- [ ] Atualizar OpenAPI do gateway, smoke manifest e artefato gerado; preservar bloqueios de domínios não relacionados.
- [ ] Rodar `pnpm smoke:coverage` e testes escopados do gateway.

### 6. Entregar interface autenticada

- [ ] Atualizar teste de auth para mostrar Marketing disponível somente com permissão e para proteger `/marketing`.
- [ ] Criar fluxo de competência, criação individual/lote, listagem e respostas, usando `useFetch`, estilos e formulários existentes.
- [ ] Integrar o indicador no dashboard e manter estados reais de loading, erro, vazio, conflito e sucesso.
- [ ] Atualizar smoke do módulo e validar a rota navegável; garantir que CTAs executem ações reais.
- [ ] Rodar teste Marketing e typecheck frontend; revisar densidade visual e uso em viewport móvel.

### 7. Revisar e validar #1545

- [ ] Atualizar Graphify do frontend e dos services se os grafos estiverem disponíveis; se não, registrar o fallback no PR.
- [ ] Rodar testes de unidade/rotas dos services, testes do app relacionados, smoke coverage, lint, typecheck e build dos pacotes afetados.
- [ ] Executar fluxo real no navegador com Playwright; capturar screenshots em `output/playwright/issue-1545/`.
- [ ] Fazer revisão Ponytail Full e revisão de segurança para autorização, importação e isolamento.
- [ ] Inspecionar `git diff`, resultados, screenshots e estado de CI antes de preparar PR para `feature/milestone-27-issues-1545-1546-1547-1548`.

## Critérios de conclusão

- Unicidade vale no banco e em operações concorrentes.
- Criação individual e em lote respeitam ativo, organização e duplicidade.
- As cinco respostas preservam o contrato e valores ainda sem resposta aparecem como pendentes.
- Importação grava somente vínculos únicos; ambiguidades ficam em reconciliação.
- Relatório e dashboard diferenciam ausência de resposta de integração explicitamente falsa.
- API, gateway e UI negam usuários sem permissão e isolam organização.
- Testes, lint, typecheck, build, smoke e fluxo no navegador têm resultados registrados.
- PR inclui critérios atendidos, evidências, validações, riscos e relação com #1545.
