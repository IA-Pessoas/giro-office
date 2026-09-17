# Task 7 — Formulário de orientação independente

## Escopo e plano executado

- Worktree: `C:\Users\Davi.Araujo.173CASTELO.000\Desktop\Repositorios\GIROOFFICE LIMPO\.worktrees\codex-issue-1125`.
- Branch: `codex/issue-1125`; base limpa: `60a9a187`.
- Referências: `task-7-brief.md`, plano `docs/superpowers/plans/2026-09-16-regularize-orientacao-checklist.md` (Task 7) e spec correspondente.
- Execução sem subagentes: descoberta frontend, ampliação do runner, RED, implementação, GREEN/refatoração, validação e commit.
- Arquivos de produto/teste alterados: `RegularizeGuidanceForm.tsx`, `RegularizePage.tsx` e `run-regularize-tests.mjs`, todos em `app/src/modules/regularize/`. Este relatório é o quarto arquivo, documental SDD.
- Rodada de correção: também foi alterado `app/src/modules/clients/components/ClientPickerModal.tsx`, extensão autorizada para corrigir o Escape/foco do seletor.
- Nenhuma alteração em backend, Prisma, shared, contratos ou cache da Task 6.

## Contexto e decisões

Graphify indisponível ou sem grafo local. `corepack pnpm graphify:context:ui -- "Task 7 regularize guidance form"` retornou código 2: `Graphify sem grafo local em app/graphify-out/graph.json`. Foram lidos os arquivos reais apontados pelo brief, os hooks, os seletores e os schemas. Não foi criado/versionado grafo nem instalado hook.

O mapa de implementação ficou restrito ao formulário (estado, validação e payload), à página (listagem independente e permissões) e ao runner (invariantes estáticas). O contrato compartilhado e os hooks existentes são dependências, não alvos de edição. A skill TDD orientou a sequência RED/GREEN; a skill worktree-development orientou a confirmação da branch, preservação do escopo e classificação das limitações ambientais.

Os seletores existentes `ClientPickerModal` e `RegularizeClientPfSelect` mantêm busca/paginação e seus estados remotos. A filtragem por organização ocorre nos serviços autenticados existentes: `ClientService.list` e `ClientPfService.list` aplicam `organization_id`. A lista de processos vem do hook organizacional existente. Não há entrada livre de IDs nem nova chamada HTTP nos componentes.

## RED

Antes de alterar produto, acrescentei três grupos ao runner estático:

1. Processo opcional, tipos de alvo, seletores, snapshot manual, limpeza dos IDs incompatíveis, vínculo atual/null e ausência de uso de `LegacyGuidanceDraft`.
2. Fonte canônica com 17 itens, status compartilhados, observação por item, ordem do payload, preservação dos campos legados e regra de filial.
3. Consulta independente explícita, criação autorizada sem processo, estados da lista, leitura sem escrita e mensagens de mutação.

Comando: `corepack pnpm --filter @workspace/app test:regularize`.

Resultado inicial: **FAIL**, código 1, no caso `guidance form supports optional process and coherent PJ PF manual targets`, com `AssertionError [ERR_ASSERTION]`: ausência de `/defaultProcessId\?: string/`. O formulário ainda exigia processo.

Um segundo RED protegeu a montagem da lista independente por `regularizeAccess.canView`: falha na expressão `/regularizeAccess\.canView \? \(\s*<IndependentGuidanceSection/`, corrigida antes da validação final.

Durante o GREEN, uma assertion foi corrigida para aceitar o acesso opcional real `item?.observation`; a regra continuou exigindo que o textarea use a observação do item. A assertion da filial passou a tolerar as quebras de linha do formatador.

## Implementação e refatoração

- Criação aceita processo vazio; edição preserva o vínculo existente, inclusive nulo, e permite trocar/remover. Submit usa `formState.process_id || null`, nunca o vínculo antigo da resposta.
- Alvos PJ/PF exigem o respectivo cadastro. Trocar de alvo limpa ambos os IDs e os dados de identificação; o payload envia apenas o ID compatível e `null` para o outro. SEM_CLIENTE exige nome manual não vazio e nenhum cadastro.
- Snapshot manual inclui versão/origem, nome, documento, endereço, cidade e UF. Snapshot cadastral é exibido sem edição; para PJ/PF o servidor deriva o snapshot do cadastro selecionado. Os campos legados permanecem editáveis.
- Inicialização, renderização e submit usam `REGULARIZE_GUIDANCE_CHECKLIST_ITEMS`. Os 17 códigos são emitidos na ordem canônica; cada item possui um dos três status compartilhados e observação editável. A entrada HTTP usa `checklist`; `checklist_items` é usado apenas para ler a resposta.
- Filial permanece desabilitada até `branch` estar `Concluído`. Rebaixar limpa `branch_data` local imediatamente. Filial concluída exige nome/endereço/cidade/UF; documento é opcional. Filial inconclusa é omitida do payload, conforme schema estrito; o checklist completo determina a limpeza transacional no backend.
- O builder retorna o membro completo de `CreateRegularizeGuidancePayload` via `Extract`, tornando inviável produzir um draft legado por esse caminho. O tipo/guard transitório da Task 6 foi preservado fora do escopo.
- `IndependentGuidanceSection` fica na aba Processos e só é montado com permissão de leitura. Chama literalmente `useRegularizeGuidance(undefined, { enabled: true })`, lista orientações da organização com e sem vínculo e oferece atualização própria. O CTA de criação não depende de processo ou cliente selecionado.
- Consulta/refresh processuais mantêm a guarda `queryPolicy.guidance && Boolean(currentProcessId)`. Detalhe do processo e fluxos legados de atividade/sócio foram preservados.
- Somente leitura permite consultar o formulário completo, desabilita os campos e oculta salvar. O handler da página também verifica a permissão de edição. Loading/erro/vazio usam `QueryStatePanel` e os seletores existentes; erro de processo é exibido no formulário.
- Sucesso mostra toast e fecha o formulário; erro/conflito mantém o formulário aberto, conserva os dados e apresenta a mensagem da API. Durante envio, campos e fechamento ficam bloqueados.
- Refatoração: dados de alvo/checklist são inicializados em um bloco comum; os campos de snapshot são renderizados em um único grupo para manual/cadastral; constantes e controles existentes foram reutilizados. Formulário formatado e imports organizados pelo Biome; os trechos novos da página/runner foram formatados sem reformatar o legado inteiro.

## Validações e evidências

| Validação | Resultado |
| --- | --- |
| `corepack pnpm --filter @workspace/app test:regularize` | GREEN após implementação e após refatoração; runner completo, incluindo os três novos grupos. |
| `corepack pnpm --filter @workspace/app typecheck` | Passou: `tsc --noEmit` e `typecheck:usefetch`. |
| `corepack pnpm --filter @workspace/app exec biome check ...` | Shim falhou: `'biome' não é reconhecido como um comando interno ou externo, um programa operável ou um arquivo em lotes.` |
| `node_modules/.bin/biome.CMD check` nos três arquivos | Configuração raiz ignora `app/`: `No files were processed in the specified paths`. |
| Biome local com configuração temporária equivalente, fora do repo | Formulário: `Checked 1 file ... No fixes applied`, código 0 no check final. |
| Biome lint temporário na página e runner | 12 erros preexistentes: 11 na página, 1 no runner; nenhum introduzido nos trechos novos. |
| Comparação dos diagnósticos com `git show HEAD:<arquivo>` | Os trechos completos das 12 localizações são idênticos aos da base: `All 12 diagnostics on unchanged baseline code: true`. |
| `git diff --check` | Passou, sem erros de whitespace. |
| Revisão de diff e call sites | Apenas os três arquivos permitidos e este relatório; payload completo, consulta explícita e guardas processuais preservados. |

O fallback do Biome usa `%TEMP%/regularize-task7-biome-9c0529969e3540ffb77de7675835b966/biome.json`, com indentação de 2 espaços, largura 100, aspas duplas, ponto e vírgula, trailing commas, regras recomendadas e verificações de imports/variáveis não usados. Não altera a configuração versionada. Os 12 apontamentos são `noLabelWithoutControl` (8), `useSemanticElements` (1) e `noUnusedVariables` (3), todos preexistentes.

## Limitações

- Cobertura desta Task 7 é estática e de compilação. Não foi executado navegador autenticado nem integração com banco/API; screenshots e fluxo end-to-end permanecem na Task 8 do plano. Os testes não demonstram interação real com seletores/modal ou persistência em ambiente ativo.
- O primeiro uso do `pnpm` direto acionou o shim 11.19.0 e falhou com `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. As validações obrigatórias foram executadas via Corepack/pnpm 10.26.0, sem reinstalar dependências.
- Avisos ambientais: Node 24.13.1 enquanto `services/src` pede Node 22, `resolutions` fora da raiz, `MODULE_TYPELESS_PACKAGE_JSON` e aviso de `pnpm.overrides` no subcomando. Nenhum exigiu alteração fora do escopo.
- Biome global não está verde; o check do formulário passou e os apontamentos restantes foram classificados por comparação com a base, sem mascarar ou desabilitar regras no repositório.
- Não houve sincronização com develop, deploy, push, mudança de ambiente ou execução de migrations; a base solicitada da Task 7 foi preservada.

Commit solicitado: `feat: add independent regularize guidance form`.

## Rodada de correção da revisão

- Corrigido o fluxo `SEM_CLIENTE`: os campos opcionais do snapshot (`address`, `city` e `state`) recebem strings seguras antes de `trimRegularizeOptionalText`, evitando `TypeError` ao converter PJ/PF para não cliente.
- `buildGuidanceFormState` e `buildGuidancePayload` agora espalham o snapshot existente antes de normalizar os campos editáveis. Assim, `company_name`, `regime`, `economic_activities`, `partners` e outros metadados válidos sobrevivem à edição.
- O status da orientação usa lista local compatível com a API: somente `Em andamento` e `Finalizado`; o carregamento de status legado é normalizado para um desses valores.
- `ClientPickerModal` captura Escape no diálogo interno, impede a propagação para o Dialog pai e foca o campo de busca ao abrir.

### Evidências da correção

| Validação | Resultado |
| --- | --- |
| RED do runner ampliado | Falhou inicialmente no novo check de hardening antes da implementação; após o ajuste do matcher, o runner completo ficou GREEN. |
| `corepack pnpm --filter @workspace/app test:regularize` | GREEN; todos os checks passaram, incluindo snapshot, status e seletor. |
| `corepack pnpm --filter @workspace/app typecheck` | GREEN após explicitar o tipo extensível do snapshot; `tsc --noEmit` e `typecheck:usefetch` passaram. |
| Biome temporário equivalente nos três arquivos de código da rodada | Sem erros nos trechos novos; restaram 3 diagnósticos preexistentes: formatação do `h2` do seletor e dois diagnósticos no runner legado. |
| `git diff --check` | GREEN. |

Limitações mantidas: não houve navegador autenticado nem integração real com API/banco. Permanecem os avisos ambientais de Node 24 versus Node 22 e do pnpm já registrados acima.
