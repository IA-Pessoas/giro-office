# Spec de Desenvolvimento: Issues Abertas com Foco Frontend

Data: 2026-06-15

## Contexto

Este spec organiza as 23 issues abertas do repositorio em uma fila de desenvolvimento
frontend-first. A intencao e permitir progresso rapido em PRs pequenos, sem perder a
separacao entre frontend, backend/gateway e itens que precisam apenas de revalidacao.

Fontes usadas:

- Issues abertas no GitHub em 2026-06-15.
- Graphify frontend local em `app/graphify-out/graph.json`, gerado a partir de `app/src`.
- Buscas locais com `rg` nos arquivos citados pelas issues.
- Regras do workspace em `.codex/rules/default.rules.md` e `.codex/config.toml`.

Observacoes de contexto:

- O grafo do frontend existe e aponta RH, integracao/task models, chat, auth e dashboards
  como areas centrais.
- O grafo de backend ainda nao existe em `services/graphify-out`; backend deve seguir o
  fallback manual ate ser gerado.
- `app/graphify-out/` e artefato local e nao deve ser versionado.
- Ha alteracoes locais existentes em `.env.example` e `.tmp/`; elas nao fazem parte deste spec.

## Objetivo

Criar uma trilha de trabalho que priorize issues pequenas, verificaveis e de baixo risco no
frontend, mantendo backend/gateway como dependencias explicitas quando necessario.

O foco inicial e:

1. Fechar ou revalidar issues que ja parecem resolvidas no codigo local.
2. Corrigir problemas pequenos de seguranca, estabilidade e UX no frontend.
3. Preparar uma segunda onda de melhorias medias sem cair diretamente em refactors grandes.
4. Registrar os epicos maiores como trilha posterior.

## Nao Objetivos

- Implementar todas as issues neste ciclo.
- Migrar toda a UI para um unico design system de uma vez.
- Resolver fluxos de produto incompletos sem decisao de regra de negocio.
- Alterar contratos HTTP sem alinhar service, OpenAPI, gateway e testes.
- Fazer mudancas de deploy/VPS sem nova revalidacao do ambiente.

## Principios de Priorizacao

Prioridade de execucao:

1. Mudanca pequena, local e facilmente testavel.
2. Corrige risco real de seguranca, vazamento, acessibilidade ou erro de runtime.
3. Nao exige decisao de produto.
4. Nao exige migracao ampla ou refactor monolitico.
5. Pode ser entregue em PR pequeno com criterio de pronto objetivo.

Issues com `priority: high` continuam importantes, mas nao entram automaticamente na primeira
fila se forem grandes ou exigirem decomposicao.

## Separacao Por Area

### Frontend

Issues principalmente frontend:

- `#255` Cookie de sessao sem flags `secure`/`sameSite`.
- `#256` Headers de seguranca ausentes.
- `#257` Upload de arquivos do chat sem limite de tamanho.
- `#258` `window.open` sem `noopener` e componente `Redirect` morto.
- `#259` Logs verbosos com detalhes de infra no console em producao.
- `#260` `ChatContext` re-renderiza a arvore inteira.
- `#261` Recharts importado estaticamente em dashboards.
- `#262` Imagens sem `next/image` e PNGs pesados.
- `#263` React Query com defaults minimos e `refetch()` manual.
- `#264` Listas longas sem virtualizacao.
- `#265` Timers sem cleanup.
- `#266` `RhScoreSection.tsx` monolitico.
- `#267` Dashboards `newLayout` monoliticos.
- `#268` `TaskModelModal` reimplementa Chakra shims inline.
- `#269` `statusConfig` duplicado.
- `#270` ocorrencias de `any`.
- `#271` overlays sem teclado/ARIA.
- `#272` quatro sistemas de estilo simultaneos.
- Partes de `#226` e `#230`, quando o comportamento correto for mostrar estado
  indisponivel/feedback em CTAs sem backend pronto.

### Backend e Gateway

Issues principalmente backend/gateway:

- `#219` Audit: `/audit/requests` retorna 502 com usuario autenticado.
- `#250` Alinhar permissoes do RH: `modules.rh = 1` para RH pessoal e `modules.rh >= 2`
  para gestao.

Issues mistas:

- `#218` Integracao: modelos de tarefas mostram erro ao carregar.
  O codigo local do `task-service` ja indica que `/task/model/list` aceita ausencia de
  `type` e `billing`, com teste cobrindo listagem geral. A issue deve ser revalidada antes
  de implementar mais backend.
- `#226` CTAs de criacao sem fluxo funcional.
  Parte e frontend, parte depende de services/fluxos ainda nao integrados.
- `#230` Botoes de importacao/exportacao sem acao.
  Comercial e marketing foram descritos como mockados/sem service; contabil pode depender
  de deploy atualizado.

## Ondas De Trabalho

### Onda 0: Revalidar e Fechar Itens Aparentemente Resolvidos

Objetivo: remover ruido do backlog antes de codar.

1. `#255` Cookie `cw.token`
   - Evidencia local: `app/src/modules/auth/utils/authCookie.ts` ja define
     `sameSite: "lax"` e `secure: nodeEnv === "production"`.
   - Acao: rodar testes de auth/typecheck, confirmar que `AuthContext` usa
     `getAuthCookieOptions()`, comentar na issue e fechar se o criterio estiver satisfeito.
   - Follow-up separado: cookie `httpOnly` exige mudanca de arquitetura backend.

2. `#256` Headers de seguranca
   - Evidencia local: `app/next.config.mjs` ja define `X-Frame-Options`,
     `X-Content-Type-Options`, `Referrer-Policy`, HSTS e CSP Report-Only.
   - Acao: validar build ou teste direcionado de config, comentar e fechar se confirmado.
   - Follow-up separado: transformar CSP Report-Only em CSP enforced com nonce/hash.

3. `#218` Modelos de tarefas
   - Evidencia local: `services/task-service/src/openapi/spec.ts` descreve `type` e
     `billing` como filtros opcionais; `taskModel.routes.test.ts` cobre listagem sem ambos.
   - Acao: revalidar frontend atual, gateway e smoke antes de alterar contrato.
   - Se ainda falhar, abrir subtarefa com causa real: frontend chamando path errado,
     gateway desatualizado ou deploy antigo.

Saida esperada da Onda 0:

- Issues fechadas ou comentadas com evidencia.
- Lista reduzida de itens realmente pendentes.

### Onda 1: Correcoes Rapidas Frontend

Objetivo: PRs pequenos, baixo risco, com validacao simples.

1. `#259` Logs verbosos em producao
   - Arquivo principal: `app/src/context/AuthContext.tsx`.
   - Mudanca: encapsular logs de erro detalhados em `process.env.NODE_ENV !== "production"`.
   - Manter toasts amigaveis existentes.
   - Criterio de pronto: producao nao loga `fullError`, URL interna ou payload de resposta;
     desenvolvimento continua com diagnostico util.
   - Validacao: `pnpm --filter @workspace/app typecheck`.

2. `#258` `window.open` sem `noopener`
   - Arquivos principais:
     - `app/src/modules/chat/components/ConversationWindow.tsx`
     - `app/src/utils/redirect.tsx`
   - Mudanca minima: usar `window.open(mediaUrl, "_blank", "noopener,noreferrer")`.
   - Para `Redirect`: se `rg` confirmar ausencia de uso, remover componente e CSS associado;
     se houver uso, reimplementar com `noopener,noreferrer` e whitelist de rotas internas.
   - Criterio de pronto: nenhum `window.open` sem `noopener,noreferrer`.
   - Validacao: `rg -n "window\\.open" app/src` e typecheck.

3. `#257` Limite de upload no chat
   - Arquivo principal: `app/src/context/ChatContext.tsx`.
   - Mudanca: criar constante de limite, validar `file.size`, trocar `alert()` por `toast`
     nos fluxos de arquivo quando possivel.
   - Limite inicial recomendado: 10 MB para imagem/audio, ajustavel por produto depois.
   - Criterio de pronto: arquivo acima do limite nao monta `FormData` nem faz request.
   - Validacao: teste manual ou teste leve do helper se a logica for extraida.
   - Dependencia backend: validar limite real no service/gateway em follow-up, porque
     validacao client-side nao e barreira de seguranca suficiente.

4. `#265` Timers sem cleanup
   - Arquivos principais:
     - `app/src/components/Iframe/Details.tsx`
     - `app/src/modules/chat/components/ConversationWindow.tsx`
   - Mudanca: limpar timeout do iframe e limpar interval/MediaRecorder/stream no unmount.
   - Criterio de pronto: desmontar componente durante carregamento/gravacao nao dispara
     `setState` tardio nem deixa microfone ativo.
   - Validacao: typecheck e smoke manual do fluxo de gravacao.

Saida esperada da Onda 1:

- 3 a 4 PRs pequenos ou um PR unico com commits separados, se a equipe preferir.
- Nenhuma mudanca de contrato HTTP.

### Onda 2: Melhorias Medias Com Escopo Controlado

Objetivo: reduzir custo de manutencao sem entrar em migracao ampla.

1. `#263` React Query
   - Fase 1: adicionar defaults globais no `QueryClient`.
   - Fase 2: remover `refetchOnWindowFocus: false` redundante gradualmente.
   - Fase 3: trocar `refetch()` manual por `invalidateQueries()` nos pontos de mutacao.
   - Comecar por `Administracao.tsx` e hooks ja com query keys claras.

2. `#271` Overlays sem teclado/ARIA
   - Para menus leves em `AppShell`: adicionar Escape e `aria-hidden` no backdrop.
   - Para modais reais: migrar para Radix Dialog ou componentes `shared/ui/newLayout`.
   - Entregar por arquivo para evitar regressao visual grande.

3. `#260` `ChatContext`
   - Ja ha `useMemo<ChatContextType>` no value local, entao a issue precisa ser reavaliada.
   - Proximo passo pequeno: confirmar listeners com deps estaveis e separar apenas o que
     muda com alta frequencia se houver evidencia de re-render.
   - Nao migrar para Zustand sem medicao ou decisao explicita.

4. `#262` Imagens
   - Comecar por imagens estaticas simples: Loader, ModulosCards, AppShell.
   - Deixar midias dinamicas assinadas do chat para fase posterior com `remotePatterns`
     ou decisao consciente de manter `<img loading="lazy">`.

5. `#269` StatusBadge
   - Criar componente compartilhado pequeno.
   - Migrar primeiro um piloto: `Tasks.tsx` ou `Parcelamento.tsx`.
   - So expandir apos validar visualmente.

### Onda 3: Epicos e Refactors Maiores

Objetivo: registrar sem bloquear a fila rapida.

1. `#266` decompor `RhScoreSection`
   - Requer plano proprio.
   - Deve preservar comportamento por aba e validar com testes/uso manual.

2. `#267` dashboards monoliticos
   - Fazer piloto em `Parcelamento` antes de replicar.
   - Conecta com `#261` Recharts dinamico e `#269` StatusBadge.

3. `#268` `TaskModelModal`
   - Pode ser dividido em duas entregas:
     - remover shims inline;
     - extrair hook/form/dependentes.

4. `#270` reduzir `any`
   - Comecar por `ClientTabs.tsx` e tipos de clientes.
   - `chakraShims.tsx` deve aguardar decisao da issue `#272`.

5. `#272` sistemas de estilo simultaneos
   - Tratar como programa de migracao, nao PR pontual.
   - Decisao alvo: Tailwind + `shared/ui/newLayout`.
   - Ordem sugerida: chat, componentes legados, shims.

6. `#261` Recharts dinamico
   - Melhor atacar junto do piloto de dashboard, extraindo componentes de graficos.

7. `#264` virtualizacao
   - Medir antes de implementar.
   - Prioridade real: lista de mensagens do chat.

## Backend e Gateway

### `#219` Audit 502

Classificacao: backend/gateway/deploy.

Abordagem:

- Revalidar ambiente atual antes de alterar codigo.
- Confirmar se `audit-service` esta rodando e se o gateway aponta para a URL correta.
- Se for codigo: alinhar gateway registry, rota publica `/audit/requests`, OpenAPI e smoke.
- Se for deploy: registrar evidencias e tratar fora do frontend.

Validacao:

- `pnpm --filter @workspace/gateway test` se houver teste aplicavel.
- `pnpm --filter @workspace/audit-service test`.
- `pnpm smoke:coverage` se contrato mudar.

### `#250` Permissoes RH

Classificacao: full-stack com forte impacto backend.

Abordagem:

- Definir regra de acesso:
  - `modules.rh >= 1`: RH pessoal/self-service.
  - `modules.rh >= 2` ou admin global: gestao de terceiros.
- Backend deve aplicar escopo self-only nas rotas pessoais.
- Frontend deve separar UX de self-service e gestao.

Validacao:

- Testes de service e rotas em `rh-service`.
- Testes frontend dos hooks de permissao quando houver cobertura.
- Smoke de rotas RH se contrato publico mudar.

## Issues De Produto e Deploy

### `#226` CTAs de criacao

Tratar como matriz por modulo:

- Se backend/fluxo existe: conectar formulario real ou rota de criacao.
- Se backend/fluxo nao existe: desabilitar CTA ou mostrar feedback claro.
- Nao implementar fluxo fake apenas para o clique "fazer algo".

Primeiro corte frontend rapido:

- Identificar CTAs que nao tem service pronto.
- Trocar clique silencioso por estado desabilitado ou toast explicativo.
- Abrir subtarefas por modulo para fluxos reais.

### `#230` Importacao/exportacao

Tratar como matriz por modulo:

- Comercial/Marketing: se continuam mockados, CTAs devem ficar indisponiveis ou informar
  funcionalidade nao implementada.
- Contabil: revalidar develop/deploy antes de codar.
- Tecnologia/Clientes: validar se o botao e acessivel por role e se ha fluxo esperado.

## Arquitetura e Fluxo de Trabalho

Para cada issue frontend:

1. Rodar `pnpm graphify:context:ui -- "<issue e area>"`.
2. Abrir primeiro os arquivos candidatos retornados.
3. Confirmar com `rg` os call sites reais.
4. Fazer a menor mudanca util.
5. Rodar validacao escopada:
   - `pnpm --filter @workspace/app typecheck`
   - `pnpm --filter @workspace/app test` quando tocar auth/clients/contabil/projects
   - smoke manual no browser para chat, upload, gravacao e modais.
6. Atualizar grafo do frontend com `pnpm graphify:update:ui` quando houver mudanca relevante
   e o comando puder ser executado no ambiente.

Para backend/gateway:

1. Gerar ou atualizar grafo de services quando houver chave/ambiente adequado.
2. Sem grafo, usar fallback manual com `rg --files` e `rg -n`.
3. Se mudar rota/contrato, alinhar service, OpenAPI, gateway e smoke.
4. Rodar testes do service afetado e `pnpm smoke:coverage`.

## Criterios Gerais De Pronto

Uma issue so deve ser considerada pronta quando:

- O comportamento descrito foi reproduzido ou a issue foi revalidada como stale.
- A mudanca tem escopo claro e nao mistura refactors grandes.
- Tests/typecheck relevantes passam ou a impossibilidade fica registrada.
- A issue recebe comentario com evidencia, comandos rodados e limitacoes restantes.
- Follow-ups arquiteturais sao registrados em issue separada ou comentario, nao escondidos
  dentro do PR.

## Ordem Recomendada Inicial

1. Revalidar `#255`, `#256` e `#218`.
2. Corrigir `#259`.
3. Corrigir `#258`.
4. Corrigir `#257`.
5. Corrigir `#265`.
6. Atacar `#263` fase 1.
7. Atacar `#271` casos leves de `AppShell`.
8. Escolher um piloto medio: `#262` imagens estaticas, `#269` StatusBadge em um arquivo ou
   `#267/#261` piloto `Parcelamento`.

Esta ordem privilegia feedback rapido, baixo risco e PRs pequenos antes dos epicos.
