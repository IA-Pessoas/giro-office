# Reconciliação e ativação do Marketing — Plano de implementação

> **Para agentes implementadores:** use `superpowers:executing-plans` para executar este plano tarefa a tarefa. Cada passo usa caixas de seleção para acompanhamento.

**Objetivo:** entregar reconciliação auditável dos conjuntos legados de Marketing e liberar o módulo somente se o inventário funcional e os contratos integrados passarem nas validações.

**Arquitetura:** persistir execuções e decisões explícitas no `marketing-service`, com escopo por organização e identidade de origem estável. Expor leitura e mutações somente pela sessão de plataforma já encaminhada pelo gateway, apresentar o fluxo na aba Super Admin existente e manter o gate centralizado até a validação final.

**Stack:** TypeScript ESM, Express, Prisma/Postgres, Zod, gateway Express, Next.js/React, Vitest e testes Node já usados no workspace.

**Especificação:** `docs/superpowers/specs/2026-09-29-marketing-migration-reconciliation-design.md`

## Restrições globais

- Limitar a mudança à issue #1549; não implementar as issues #1542–#1548.
- Não escrever, corrigir ou apagar dados no sistema legado; não executar carga em produção.
- Toda resolução exige escolha explícita de destino canônico e registra operador verificado e instante do servidor.
- Não revelar senha, payload criptografado ou dados pessoais desnecessários nas respostas, telas ou logs.
- Chamada de plataforma deve exigir política `platformOnly`, sessão válida, CSRF em mutações e cabeçalhos internos confiáveis no serviço.
- Cada consulta e mutação deve restringir-se à organização selecionada e validada no servidor.
- Marketing permanece desabilitado enquanto qualquer função ou contrato inventariado não passar nas validações integradas.

## Foco de revisão

- Identidade de origem ausente ou instável não pode ser resolvida; testar que permanece pendente e não cria decisão.
- Decisão repetida para o mesmo item não pode duplicar histórico nem trocar silenciosamente o destino; testar conflito e histórico imutável.
- Organização diferente ou destino inexistente deve ser rejeitado sem revelar se o registro de outro tenant existe; testar isolamento e resposta.
- Quarentena por segredo, duplicidade ou dado inválido não pode ser resolvida como associação ambígua; testar categoria elegível e sanitização.
- Falha em qualquer item do inventário deve manter o gate de Marketing fechado para usuário comum, administrador de organização e administrador global; testar rota direta, navegação e permissão.

---

### Tarefa 1: Persistir resumo de execução e decisões auditáveis

**Arquivos:**
- Modificar: `infra/prisma/schema.prisma`
- Criar: `infra/prisma/migrations/20260929120000_marketing_migration_reconciliation/migration.sql`
- Criar: `services/marketing-service/src/services/marketingMigrationReconciliationService.ts`
- Criar: `services/marketing-service/src/services/marketingMigrationReconciliationRunner.ts` para executar o dry-run somente leitura dos conjuntos Marketing e persistir o snapshot do resultado.
- Criar: `services/marketing-service/src/test/marketingMigrationReconciliationService.test.ts`
- Modificar: `services/marketing-service/src/config/env.ts` e `services/marketing-service/README.md` para configurar `MIGRATION_SOURCE_DIR` sem valor padrão e documentar seu acesso somente leitura.
- Modificar: `docs/migration/v4/scripts/dry-run.mjs`, `docs/migration/v4/scripts/lib/execution-engine.mjs` e `docs/migration/v4/scripts/runtime/remaining.mjs` para suportar decisões registradas e relatório sanitizado por item apenas para conjuntos Marketing.
- Modificar: `docs/migration/v4/scripts/test/dry-run.test.mjs`, `docs/migration/v4/scripts/test/execution-engine.test.mjs` e adicionar testes de runtime para as decisões explícitas.
- Modificar: `services/marketing-service/package.json` somente se um comando de teste focado for necessário.

**Interfaces:**
- Serviço recebe `organizationId` validado; o runner lê a origem por V4 somente em modo read-only e nunca escreve nela.
- O dry-run V4 disponibiliza somente para estes conjuntos Marketing cada identidade estável já calculada pelo executor, estado e código de motivo; não inclui linhas ou payloads da origem e não limita a lista a uma amostra de identidades.
- O resumo identifica conjunto, estado (`not_run` ou execução concluída), totais preparados/importados/em quarentena e data da execução. “Importado” vem do estado persistido no destino; “preparado” e “quarentena” vêm da execução read-only do V4.
- Uma pendência tem conjunto, tabela/escopo de origem, identidade estável, código de motivo e metadados sanitizados.
- Uma decisão tem organização, identidade de origem, destino canônico, ator verificado e instante de criação; identidade da pendência é única por organização/conjunto/origem.
- Reexecução aplica decisões sobre o snapshot persistido da última execução, produz uma nova execução e não altera nem relê com escrita a fonte legada; associação por nome continua proibida.
- O runner só executa quando `MIGRATION_SOURCE_DIR` aponta para uma cópia da origem validada e somente leitura; configuração ausente/inválida retorna estado não executado e nunca habilita Marketing.
- Conjuntos abrangidos: `eventos`, `eventos_edicoes`, `eventos_feedbacks_periodos`, `eventos_feedbacks`, `redes_sociais`, `senhas` e importações de uso de IA já persistidas.

- [ ] **Passo 1: Escrever testes falhos** para o relatório V4 por item (identidade estável sem linha/payload, sem truncamento), reaplicação de decisão explícita e rejeição de identidade ausente ou de categoria não resolvível.
- [ ] **Passo 2: Rodar `node --test docs/migration/v4/scripts/test/dry-run.test.mjs docs/migration/v4/scripts/test/execution-engine.test.mjs`** e confirmar as falhas de relatório/reaplicação.
- [ ] **Passo 3: Implementar a saída sanitizada por item e o adaptador de decisão V4** limitado às seis origens `tb_mkt` aprovadas; preservar execução read-only e não emitir conteúdo de senha, payload ou linha de origem.
- [ ] **Passo 4: Escrever e rodar testes falhos do serviço** para estado `not_run`, totais por conjunto, isolamento por organização, importados consultados no destino, decisão com ator/data, destino inválido e repetição idempotente.
- [ ] **Passo 5: Implementar modelos Prisma e serviço** para persistir resumos e decisões, alimentar o relatório do dry-run com decisões registradas e gravar novo resumo sem atualizar a fonte legada; testar dry-run e serviço focados.
- [ ] **Passo 6: Commitar** modelos, migração, adaptador, serviço e testes.

### Tarefa 2: Proteger e publicar os contratos de reconciliação

**Arquivos:**
- Criar: `services/marketing-service/src/schemas/marketingMigrationReconciliation.schemas.ts`
- Criar: `services/marketing-service/src/routes/marketingMigrationReconciliation.routes.ts`
- Criar: `services/marketing-service/src/test/marketingMigrationReconciliation.routes.test.ts`
- Modificar: `services/marketing-service/src/app.ts`
- Modificar: `services/marketing-service/src/openapi/spec.ts`
- Modificar: `services/marketing-service/src/middlewares/isAuthenticated.ts` somente para aceitar identidade confiável de plataforma já validada pelo gateway.
- Modificar: `services/gateway/src/security/policies.ts`, `services/gateway/src/config/serviceRegistry.ts`, `services/gateway/src/proxy/httpProxy.ts` e testes correspondentes para encaminhar `/platform/marketing/...` ao `marketing-service`, removendo o prefixo `/platform` antes de chegar ao serviço e aplicando política `platformOnly`.
- Modificar: `scripts/all-services-smoke.manifest.mjs` e testes do gateway/smoke para cobrir contratos públicos.
- Modificar: `app/src/modules/superAdmin/services/platformService.ts` para chamar as rotas com `platformApi`.

**Interfaces:**
- `GET /platform/marketing/migration-reconciliation?organizationId=...` retorna estado, totais e pendências sanitizadas; o gateway encaminha para `/marketing/migration-reconciliation` no serviço.
- `POST /platform/marketing/migration-reconciliation/:dataset/:sourceId/resolve` recebe apenas `organizationId` e `canonicalTargetId`; ator vem dos cabeçalhos confiáveis verificados e CSRF da sessão.
- `POST /platform/marketing/migration-reconciliation/:dataset/reconcile` recebe `organizationId`, reaplica decisões registradas e grava novo resumo.
- Todas as rotas são independentes da permissão normal do módulo Marketing para que continuem acessíveis com o gate fechado.

- [ ] **Passo 1: Escrever testes falhos** de sessão/CSRF ausentes, identidade interna ausente, leitura autorizada, mutação protegida, tenant divergente, destino inválido e respostas sem segredos.
- [ ] **Passo 2: Rodar os testes de rota e gateway focados** e confirmar rejeições por rota/política ausentes.
- [ ] **Passo 3: Implementar schemas, rotas, política, registro de upstream, encaminhamento de sessão/CSRF, OpenAPI e manifesto smoke**, delegando validação e persistência à Tarefa 1.
- [ ] **Passo 4: Rodar testes de rota/gateway e `pnpm smoke:coverage`**, confirmando autorização, CSRF, isolamento e cobertura good/bad dos contratos.
- [ ] **Passo 5: Commitar** schemas, rotas, políticas, OpenAPI, smoke e testes.

### Tarefa 3: Operar reconciliação no Super Admin

**Arquivos:**
- Modificar: `app/src/modules/superAdmin/components/SuperAdminPage.tsx`
- Criar: `app/src/modules/superAdmin/components/MarketingMigrationReconciliationTab.tsx`
- Criar: `app/src/modules/superAdmin/services/marketingMigrationReconciliation.ts` (ou seguir o módulo de serviço existente no diretório, se houver)
- Modificar: `app/src/modules/superAdmin/run-super-admin-tests.mjs` e `app/src/modules/superAdmin/run-super-admin-browser-smoke.mjs`.
- Criar: evidências em `output/playwright/`.

**Interfaces:**
- A aba reutiliza a organização selecionada no Super Admin e carrega os estados sem execução como “não executado”.
- Exibe totais por conjunto e pendências com origem e motivo; ação de resolver só aparece para associação ambígua com destinos canônicos elegíveis.
- Resolução e reconciliação atualizam a tela após resposta; a UI não envia identidade do operador nem dados de origem secretos.

- [ ] **Passo 1: Escrever testes falhos** para seleção de organização, exibição de totais/pêndencias, ausência de ação em item não elegível, confirmação de destino explícito e atualização após nova execução.
- [ ] **Passo 2: Rodar `pnpm --filter @workspace/app test:super-admin`** e confirmar as falhas específicas do fluxo novo.
- [ ] **Passo 3: Implementar cliente de API e aba** seguindo os componentes e estilos atuais do Super Admin.
- [ ] **Passo 4: Rodar testes e smoke real com Playwright**, validar leitura, resolução, atualização, dados sanitizados e acesso enquanto Marketing está bloqueado; salvar screenshots em `output/playwright/`.
- [ ] **Passo 5: Commitar** componente, cliente e evidências relevantes.

### Tarefa 4: Validar inventário e aplicar o gate final de Marketing

**Arquivos:**
- Modificar: `app/src/modules/auth/utils/moduleAccess.ts`
- Modificar: `app/src/modules/auth/run-auth-tests.mjs`
- Modificar: `app/src/modules/superAdmin/run-super-admin-tests.mjs` se a rota operacional depender das regras centralizadas de navegação.
- Verificar sem expandir escopo: funções, rotas, OpenAPI, importadores, permissões, relatórios, segredos e dependências existentes do Marketing em `app/`, `services/marketing-service/`, `services/gateway/` e `docs/migration/v4/`.

- [ ] **Passo 1: Acrescentar testes falhos** para acesso Marketing por navegação, rota direta e permissão dos três perfis quando bloqueado e quando habilitado; cobrir que o Super Admin continua acessível.
- [ ] **Passo 2: Rodar testes de inventário/auth** e registrar a lista objetiva de critérios aprovados e pendentes.
- [ ] **Passo 3: Aplicar a decisão do gate**: remover Marketing de `DISABLED_MODULE_KEYS` somente se todos os critérios integrados da especificação passarem; se algum falhar, manter Marketing desabilitado e registrar o bloqueio sem declarar a issue concluída.
- [ ] **Passo 4: Validar testes Marketing, auth, Super Admin e contratos; executar lint, typecheck, build e smoke escopados**, além dos testes V4 relevantes, sem executar importação de produção.
- [ ] **Passo 5: Fazer revisão de segurança e simplificação**, corrigir problemas encontrados, atualizar evidências do PR e commitar o gate e testes.

## Revisão de cobertura da especificação

- Totais, estado `not_run`, origem e motivo: Tarefa 1 produz relatório itemizado; Tarefas 2 e 3 servem e exibem esses dados.
- Resolução explícita auditada, tenant e reexecução: Tarefas 1 e 2.
- Ausência de associação por aproximação e preservação read-only da origem: Tarefas 1 e 2.
- Gate centralizado e ativação condicionada ao inventário integrado: Tarefa 4.
- Sessão de plataforma, CSRF, identidade confiável, contrato e navegação: Tarefas 2 e 3.
- Evidências de navegador, screenshots, validações e revisão: Tarefas 3 e 4.

## Dependências e risco

- PR #1581 foi mergeado em `develop`; validar funções e contratos pelo código e testes atuais.
- Issues #1543 e #1544 ainda aparecem como abertas. Não as implementar; se o inventário revelar uma dependência funcional ausente, manter o gate fechado e deixar explícita a pendência que impede a conclusão.
- O dry-run atual usa caminho de backup fixo no CLI e só retorna até 20 digests por grupo de quarentena; a implementação precisa aceitar a origem configurada, criar e persistir um snapshot completo e sanitizado dos conjuntos de Marketing e validar a execução com fixtures. Se não houver uma origem/snapshot utilizável em runtime, a reconciliação não pode ser anunciada como pronta nem o gate pode ser aberto.
- Graphify não tem grafo local no worktree e sua geração de contexto tentou instalar dependências com erro `EPERM`; continuar pelo fallback manual documentado em `AGENTS.md`.
- Não declarar #1549 concluída, abrir PR ou habilitar Marketing enquanto testes integrados, revisão, CI e critérios de aceite não estiverem aprovados.
