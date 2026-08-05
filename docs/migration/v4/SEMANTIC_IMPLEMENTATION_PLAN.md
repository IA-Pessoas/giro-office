# Migração V4 — Mapeamento semântico integral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir o pacote V4 com revisão semântica das 312 tabelas do legado, adaptações comprovadas para destinos já existentes, quarentena sanitizada e preflight Supabase estritamente somente leitura.

**Architecture:** O pacote combina inventário streaming, evidência reproduzível do PHP legado, decisões aprofundadas por domínio, catálogo Prisma e um grafo de transformações por sourceTable. Cada regra confirmada possui passos insert, merge, lookup, derived ou aggregate e emite somente decisões sanitizadas durante o dry-run. Regras sem evidência suficiente permanecem pending.

**Tech Stack:** Node.js ESM, node:test, node:assert/strict, crypto e streams nativos, PHP legado como fonte somente leitura, schema Prisma como contrato estático, PostgreSQL via pg somente no preflight READ ONLY, CSV e JSON determinísticos.

## Global Constraints

- Backup atual: /home/bruno/Documents/03.08.2026, exatamente 312 arquivos SQL.
- Código legado: /home/bruno/Documents/workspace2, sempre somente leitura.
- Backups históricos somente leitura: /home/bruno/Documents/06.07.2026 e /home/bruno/Documents/10.07.2026.
- Tenant único: Castelo Contabilidade, organization_id e8048d1c-0830-45d7-84de-68e20abd685b.
- Namespace UUID v5: 3f68d246-0b54-4a10-9415-a8845a767fb5.
- sourceTable é o stem integral do arquivo SQL; todos os segmentos separados por ponto são preservados.
- Prioridade de evidências: comportamento comprovado no legado; contrato real atual; metadados e vínculos explícitos do backup; migrações anteriores apenas como referência.
- Todos os novos arquivos versionados ficam em docs/migration/v4/.
- Não alterar schema Prisma, migrations, serviços, APIs, tabelas ou contratos do produto.
- Não propor nem criar tabelas, schemas ou serviços.
- Não executar INSERT, UPDATE, DELETE, TRUNCATE, MERGE, COPY, DDL, RPC mutável ou Prisma migration.
- Não implementar limpeza nem aplicação nesta entrega.
- O preflight usa BEGIN TRANSACTION READ ONLY.
- Nunca versionar dumps, linhas brutas, credenciais, URLs com senha, tokens, chaves, PFX, PEM ou segredos.
- Classificações auxiliares da auditoria não substituem o estado final: toda origem termina confirmed ou pending.
- Uma regra anterior nunca é aceita sem revalidação contra o comportamento legado e o contrato atual.
- TDD é obrigatório em cada tarefa: teste comportamental RED, implementação mínima, GREEN e refatoração mantendo GREEN.
- Saídas são ordenadas e reprodutíveis; relógio é injetado nos testes.
- Cada tarefa termina em commit próprio e revisão independente antes da próxima.

## Baseline já concluída e revisada

- Parser streaming e UUID v5: commits 988a0714, a6fc1e53.
- Serialização segura e determinística: commits 38fd6882, 3dbef541, c272cee7.
- Inventário 312/312 e stems integrais: commits 051d97c3, 9632b5a2.
- Catálogo Prisma estático, 95 modelos: commits 22fbae74, fefd514b.
- O commit 42686936 contém uma primeira versão das regras V2 que não está semanticamente aprovada. Este plano a substitui.
- O desenho vinculante está em docs/migration/v4/DESIGN.md no commit caf0f6c4.

## Contratos congelados

    EvidenceDecision = {
      sourceTable: string,
      legacyModule: string,
      legacyReferences: string[],
      operations: ("select" | "insert" | "update" | "delete" | "dynamic")[],
      legacyRelationships: string[],
      currentContractEvidence: string[],
      finalStatus: "confirmed" | "pending",
      reasonCode: string,
      reason: string,
      confidence: "high" | "medium" | "low",
      ruleId: string | null
    }

    IdentitySpec =
      | {
          kind: "generate",
          legacyColumn: string,
          scope: string,
          namespace: "3f68d246-0b54-4a10-9415-a8845a767fb5"
        }
      | {
          kind: "resolve",
          sourceTable: string,
          sourceColumn: string,
          targetLegacyColumn: string
        }
      | {
          kind: "lookup",
          criteria: LookupCriterion[],
          onZero: "quarantine" | "null",
          onMany: "quarantine"
        }
      | {
          kind: "aggregate",
          parentSourceTable: string,
          parentLegacyColumn: string,
          childForeignKey: string
        }

    ColumnRule = {
      sourceColumn: string | null,
      destinationColumn: string | null,
      status: "mapped" | "not_preserved",
      transformation: string,
      nullHandling: string,
      referenceRole: string,
      sensitivity: "none" | "personal" | "credential" | "secret",
      reason: string
    }

    DestinationStep = {
      stepId: string,
      destinationTable: string,
      mode: "insert" | "merge" | "lookup" | "derived" | "aggregate",
      identity: IdentitySpec,
      columns: ColumnRule[],
      constants: Record<string, string | number | boolean | null>,
      defaults: Record<string, string | number | boolean | null>,
      precedence: string[],
      dependencies: string[]
    }

    MappingRule = {
      sourceTable: string,
      status: "confirmed",
      domain: string,
      ruleOrigin: string,
      evidence: {
        legacy: string[],
        current: string[]
      },
      cardinality: "1:1" | "N:1" | "1:N",
      dependencies: string[],
      destinations: DestinationStep[],
      classifySourceRow: (row, context) => SourceClassification,
      emitRows: (row, context) => EmissionDecision[]
    }

    EmissionDecision = {
      stepId: string,
      destinationTable: string,
      status: "prepared" | "quarantine" | "not_emitted",
      identityRef: string,
      field: string | null,
      reasonCode: string | null
    }

    MappingResult = {
      tableMappings: TableMapping[],
      destinationMappings: DestinationMapping[],
      columnMappings: ColumnMapping[],
      pendingTables: TableMapping[],
      quarantineItems: QuarantineItem[],
      emissionCounts: Record<string, EmissionCounts>,
      quarantineSummary: QuarantineSummary
    }

Regras dos contratos:

- EvidenceDecision finalStatus confirmed exige ao menos uma referência legada válida, uma evidência atual válida e ruleId não nulo.
- EvidenceDecision sem referência de código ou sem contrato atual termina pending com motivo objetivo.
- MappingRule possui uma única sourceTable e uma ou mais destinations.
- Cada stepId é único dentro da regra.
- Todo destinationTable e destinationColumn existe no catálogo Prisma.
- emitRows não retorna payload nem valor bruto; somente decisões e referências sanitizadas.
- Uma emissão em quarantine não bloqueia emissões independentes da mesma linha.
- Merge usa vínculo legado explícito antes de qualquer campo natural.
- Lookup natural retorna quarantine quando houver múltiplos candidatos.
- Toda linha lida fecha em prepared, quarantine ou not_emitted justificado por passo aplicável.
- Métricas são registradas por sourceTable, stepId e destinationTable.

---

## Task 1: Versionar a evidência reproduzível do sistema legado

**Files:**

- Create: docs/migration/v4/scripts/lib/legacy-code-scanner.mjs
- Create: docs/migration/v4/scripts/lib/semantic-evidence.mjs
- Create: docs/migration/v4/scripts/analyze-legacy.mjs
- Create: docs/migration/v4/scripts/test/fixtures/legacy-mini/
- Create: docs/migration/v4/scripts/test/legacy-code-scanner.test.mjs
- Create: docs/migration/v4/scripts/test/semantic-evidence.test.mjs
- Create: docs/migration/v4/scripts/test/analyze-legacy-cli.test.mjs
- Read: docs/migration/v4/reports/source-inventory.json quando existir
- Read: infra/prisma/schema.prisma

**Interfaces:**

- Consumes: buildSourceInventory({ sourceDir, expectedTables }), loadPrismaCatalog(schemaPath), writeStableJson(filePath, value).
- Produces: scanLegacyUsage({ legacyDir, sourceTables }), buildEvidenceCatalog({ inventory, usage, prismaCatalog, overlays }), validateEvidenceCoverage(catalog, inventory).

- [ ] Criar fixture PHP com SELECT, INSERT, UPDATE, DELETE, helper Painel::select, tabela em string e padrão dinâmico tb_admin.permissoes_ com módulo interpolado.

- [ ] Escrever teste que espere catálogo de uso com arquivo:linha relativo, operações deduplicadas, relação dinâmica sinalizada e exclusão de vendor, uploads e binários.

- [ ] Rodar o teste para confirmar RED:

    node --test docs/migration/v4/scripts/test/legacy-code-scanner.test.mjs

  Resultado esperado: ERR_MODULE_NOT_FOUND para legacy-code-scanner.mjs.

- [ ] Implementar scanLegacyUsage com fs/promises, leitura textual limitada a PHP/SQL/JS do legado, exclusões fixas e referências relativas; não ler valores dos INSERT dos dumps.

- [ ] Escrever testes de buildEvidenceCatalog com quatro casos literais: destino direto, adaptação, sem destino atual e sem referência de código.

- [ ] Confirmar RED de semantic-evidence:

    node --test docs/migration/v4/scripts/test/semantic-evidence.test.mjs

- [ ] Implementar buildEvidenceCatalog e validateEvidenceCoverage exigindo exatamente o mesmo conjunto de sourceTable do inventário, EvidenceDecision completo e nenhum confirmed sem evidência atual.

- [ ] Escrever teste da CLI com argumentos obrigatórios --legacy-source, --source, --prisma, --out-json, --out-md e --expected-tables; argumento desconhecido falha.

- [ ] Confirmar RED da CLI e implementar analyze-legacy.mjs sem efeitos colaterais no import.

- [ ] Rodar os três testes:

    node --test docs/migration/v4/scripts/test/legacy-code-scanner.test.mjs docs/migration/v4/scripts/test/semantic-evidence.test.mjs docs/migration/v4/scripts/test/analyze-legacy-cli.test.mjs

  Resultado esperado: PASS.

- [ ] Executar auditoria real somente em /tmp:

    node docs/migration/v4/scripts/analyze-legacy.mjs --legacy-source /home/bruno/Documents/workspace2 --source /home/bruno/Documents/03.08.2026 --prisma infra/prisma/schema.prisma --out-json /tmp/giro-v4-legacy-evidence.json --out-md /tmp/giro-v4-legacy-evidence.md --expected-tables 312

  Resultado esperado: 312 entradas únicas, zero linha bruta e nenhum arquivo alterado no legado.

- [ ] Rodar Biome, git diff --check e confirmar que somente os arquivos da tarefa serão commitados.

- [ ] Commitar:

    git add docs/migration/v4/scripts/lib/legacy-code-scanner.mjs docs/migration/v4/scripts/lib/semantic-evidence.mjs docs/migration/v4/scripts/analyze-legacy.mjs docs/migration/v4/scripts/test/fixtures/legacy-mini docs/migration/v4/scripts/test/legacy-code-scanner.test.mjs docs/migration/v4/scripts/test/semantic-evidence.test.mjs docs/migration/v4/scripts/test/analyze-legacy-cli.test.mjs
    git commit -m "feat(migration-v4): add legacy semantic evidence"

---

## Task 2: Evoluir o contrato para um grafo de transformações

**Files:**

- Modify: docs/migration/v4/scripts/lib/mapping-contract.mjs
- Modify: docs/migration/v4/scripts/rules/v2.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Modify: docs/migration/v4/scripts/test/mapping-contract.test.mjs
- Modify: docs/migration/v4/scripts/test/rules-v2.test.mjs

**Interfaces:**

- Consumes: PrismaCatalog, assertRuleMatchesPrisma(rule, catalog), contratos congelados deste plano.
- Produces: validateDestinationStep(step, catalog), validateMappingRule(rule, catalog), buildRuleRegistry(groups), createPendingMapping(sourceInspection, evidenceDecision).

- [ ] Escrever testes literais para uma regra 1:1 insert, uma N:1 merge, uma 1:N com duas emissions e uma aggregate de filho em JSON do pai.

- [ ] Escrever testes de rejeição para stepId duplicado, destinationTable inexistente, coluna inexistente, evidence vazia, resolve sem origem, lookup sem onMany quarantine e transformação plain/copy/preserve_raw em credential.

- [ ] Rodar mapping-contract.test.mjs e confirmar RED porque o contrato atual só aceita destinationTable singular.

- [ ] Implementar validateDestinationStep e o novo validateMappingRule; remover destinationTable, identity, columns e classifyRow do nível raiz.

- [ ] Implementar createPendingMapping a partir de EvidenceDecision pending, preservando evidence e sem sugerir destino.

- [ ] Migrar mecanicamente as 16 regras atuais para destinations com um passo insert, sem declarar a semântica aprovada; marcar ruleOrigin como draft revalidated in Task 3.

- [ ] Atualizar rules-v2.test.mjs para testar somente compatibilidade estrutural nesta tarefa; decisões semânticas pertencem à Task 3.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/mapping-contract.test.mjs docs/migration/v4/scripts/test/rules-v2.test.mjs

  Resultado esperado: PASS.

- [ ] Rodar toda a suíte V4 existente e registrar qualquer falha preexistente separadamente:

    node --test docs/migration/v4/scripts/test/*.test.mjs

- [ ] Rodar Biome e git diff --check.

- [ ] Commitar:

    git add docs/migration/v4/scripts/lib/mapping-contract.mjs docs/migration/v4/scripts/rules/v2.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/mapping-contract.test.mjs docs/migration/v4/scripts/test/rules-v2.test.mjs
    git commit -m "refactor(migration-v4): support semantic destination steps"

---

## Task 3: Refazer as 16 regras V2 a partir do comportamento legado

**Files:**

- Create: docs/migration/v4/scripts/evidence/v2.mjs
- Modify: docs/migration/v4/scripts/rules/v2.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Create: docs/migration/v4/scripts/test/evidence-v2.test.mjs
- Modify: docs/migration/v4/scripts/test/rules-v2.test.mjs
- Read: /home/bruno/Documents/workspace2/classes/
- Read: /home/bruno/Documents/workspace2/regularize/
- Read: /home/bruno/Documents/workspace2/integracao/
- Read: infra/prisma/schema.prisma
- Read: services/client-service/src/
- Read: services/project-service/src/
- Read: services/task-service/src/
- Read: services/regularize-service/src/

**Interfaces:**

- Consumes: EvidenceDecision, MappingRule, DestinationStep e buildRuleRegistry.
- Produces: V2_EVIDENCE com 16 decisões e V2_RULES com 16 regras confirmadas semanticamente.

- [ ] Escrever teste que exija exatamente as 16 sourceTable V2, referências legadas existentes, evidência atual existente, finalStatus confirmed e ruleId correspondente.

- [ ] Confirmar RED porque evidence/v2.mjs ainda não existe.

- [ ] Implementar as nove topologias diretas com correções comprovadas: departamentos, usuários, clientes Integração, modelos expressos, planos, ligações plano-modelo, alvarás, processos e taxas municipais.

- [ ] Adicionar regressão de usuário: senha bcrypt é preservada; senha legada não vazia usa transformação bcrypt_hash_legacy_plaintext; valor nunca aparece em emission/report; senha vazia gera quarantine.

- [ ] Escrever testes RED para as sete adaptações:

  - colaborador resolve e faz merge no User criado por tb_admin.usuarios;
  - cliente Regularize faz merge pelo cliente_id explícito ou insert próprio quando o vínculo não existe;
  - prospecção emite merge em clients e insert em integracao.projects;
  - tarefa resolve ou deriva TaskModel e Project preservando client_id;
  - orientação autônoma deriva Process antes de ProceduralGuidance;
  - sócios agregam no JSON regularize.proceduralGuidances.partners;
  - clientes_senhas expande slots lógicos em sites e credenciais.

- [ ] Implementar as sete regras sem criar destino novo. Para sócios, proibir regularize.partners e clients.pf nessa origem.

- [ ] Implementar slots de credencial Gov.br, Regularize, Simples, Bacen, MEI, SEFAZ, WebISS Master, WebISS CPF e SEIFSA; dois WebISS CPF podem emitir duas credenciais do mesmo site.

- [ ] Exigir transformação encrypt_credential para login e senha e quarantine por emissão quando a capacidade criptográfica não estiver pronta.

- [ ] Adicionar testes de colunas reais dos dumps, defaults, not_preserved e razão objetiva para toda coluna não usada.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/evidence-v2.test.mjs docs/migration/v4/scripts/test/rules-v2.test.mjs

  Resultado esperado: PASS nas 16 decisões e sete topologias adaptadas.

- [ ] Rodar suíte V4, Biome e git diff --check.

- [ ] Commitar:

    git add docs/migration/v4/scripts/evidence/v2.mjs docs/migration/v4/scripts/rules/v2.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/evidence-v2.test.mjs docs/migration/v4/scripts/test/rules-v2.test.mjs
    git commit -m "fix(migration-v4): rebuild v2 rules from legacy behavior"

---

## Task 4: Revisar semanticamente RH e Departamento Pessoal

**Files:**

- Create: docs/migration/v4/scripts/evidence/rh-pessoal.mjs
- Create: docs/migration/v4/scripts/rules/rh-pessoal.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Create: docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs
- Create: docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs
- Read: /home/bruno/Documents/workspace2/rh/
- Read: /home/bruno/Documents/workspace2/pessoal/
- Read: /home/bruno/Documents/workspace2/classes/
- Read: scripts/migration-rh-pessoal-v3-dry-run.mjs
- Read: docs/migration/v3/rh-pessoal-dry-run.md
- Read: services/rh-service/src/
- Read: services/pessoal-service/src/

**Interfaces:**

- Consumes: EvidenceDecision, MappingRule e registry com V2 já registrado.
- Produces: RH_PESSOAL_EVIDENCE e RH_PESSOAL_RULES sem colisão de sourceTable.

- [ ] Extrair o conjunto de origens RH/Pessoal do inventário e exigir EvidenceDecision para cada uma, inclusive as antigas QUARANTINE_ONLY.

- [ ] Confirmar RED porque os módulos de evidência/regra não existem.

- [ ] Implementar evidências com operações legadas, relações, contrato atual e decisão confirmed/pending; regra anterior sem evidência atual permanece pending.

- [ ] Implementar regras confirmed com merge em User quando aplicável, referências corrigidas de requester, assignee opcional conforme Prisma e cargo resolvido por catálogo.

- [ ] Adicionar testes para USER_REFERENCE_NOT_FOUND, CREDENTIAL_REQUIRES_ENCRYPTION, requester corrigido, assignee nulo, sindicato/obrigação com uniques atuais e exclusão de valores pessoais da quarentena.

- [ ] Garantir que tabelas pending não produzam emissions e que toda coluna tenha mapped ou not_preserved com razão.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs

- [ ] Rodar regras V2 + RH/Pessoal juntas para confirmar zero colisões.

- [ ] Rodar Biome, git diff --check e commit:

    git add docs/migration/v4/scripts/evidence/rh-pessoal.mjs docs/migration/v4/scripts/rules/rh-pessoal.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/evidence-rh-pessoal.test.mjs docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs
    git commit -m "feat(migration-v4): add semantic rh pessoal rules"

---

## Task 5: Revisar Tecnologia, Certificados e Parcelamento

**Files:**

- Create: docs/migration/v4/scripts/evidence/technology-certificates-parcelamento.mjs
- Create: docs/migration/v4/scripts/rules/tecnologia.mjs
- Create: docs/migration/v4/scripts/rules/certificates.mjs
- Create: docs/migration/v4/scripts/rules/parcelamento.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Create: docs/migration/v4/scripts/test/evidence-specialized.test.mjs
- Create: docs/migration/v4/scripts/test/rules-specialized.test.mjs
- Read: /home/bruno/Documents/workspace2/tecnologia/
- Read: /home/bruno/Documents/workspace2/certificado/
- Read: /home/bruno/Documents/workspace2/parcelamento/
- Read: scripts/apply-tecnologia-v1-current-tenant.mjs
- Read: scripts/migration-certificates-v1-dry-run.mjs
- Read: scripts/apply-parcelamento-v1-current-tenant.mjs
- Read: services/regularize-service/src/ quando o contrato atual estiver nesse serviço

**Interfaces:**

- Consumes: contratos semânticos e catálogo Prisma.
- Produces: decisões para todas as origens dos três domínios e regras apenas para destinos comprovados.

- [ ] Escrever teste de cobertura exata das origens desses domínios no inventário.

- [ ] Confirmar RED e implementar EvidenceDecision por tabela usando código legado antes dos scripts anteriores.

- [ ] Adicionar teste e regra para tb_tecnologia.estoque emitindo categoria, localização e item nos três destinos existentes, com deduplicação determinística por organização/nome.

- [ ] Adicionar regressões para credenciais TI e reset tokens sem valor em saída; capacidade criptográfica ausente gera quarantine por emissão.

- [ ] Adicionar regressões de certificados: data inválida, identidade duplicada, metadata obrigatória e segredo PFX/PEM sempre ausente dos relatórios.

- [ ] Adicionar regressões de parcelamento: identidade atual do acordo, cliente/responsável, estados sem correspondência e competência; ausência de contrato atual produz pending.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/evidence-specialized.test.mjs docs/migration/v4/scripts/test/rules-specialized.test.mjs

- [ ] Rodar registry completo, Biome, git diff --check e commit:

    git add docs/migration/v4/scripts/evidence/technology-certificates-parcelamento.mjs docs/migration/v4/scripts/rules/tecnologia.mjs docs/migration/v4/scripts/rules/certificates.mjs docs/migration/v4/scripts/rules/parcelamento.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/evidence-specialized.test.mjs docs/migration/v4/scripts/test/rules-specialized.test.mjs
    git commit -m "feat(migration-v4): add semantic specialized rules"

---

## Task 6: Revisar Administração e domínios empresariais

**Files:**

- Create: docs/migration/v4/scripts/evidence/admin-business.mjs
- Create: docs/migration/v4/scripts/rules/admin-business.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Create: docs/migration/v4/scripts/test/evidence-admin-business.test.mjs
- Create: docs/migration/v4/scripts/test/rules-admin-business.test.mjs
- Read: /home/bruno/Documents/workspace2/atendimento/
- Read: /home/bruno/Documents/workspace2/comercial/
- Read: /home/bruno/Documents/workspace2/financeiro/
- Read: /home/bruno/Documents/workspace2/contabil/
- Read: /home/bruno/Documents/workspace2/fiscal/
- Read: /home/bruno/Documents/workspace2/classes/
- Read: services/department-service/src/
- Read: services/client-service/src/
- Read: services/contabil-service/src/
- Read: services/fiscal-service/src/

**Interfaces:**

- Consumes: inventário, catálogo de uso legado e registry das Tasks 3–5.
- Produces: evidência para Administração, permissões, Atendimento, Comercial, Financeiro, Contábil e Fiscal; regras sem colisão.

- [ ] Construir conjunto esperado por prefixo do inventário e excluir explicitamente sourceTable já pertencente à V2.

- [ ] Escrever teste que falhe se qualquer origem do conjunto não tiver EvidenceDecision.

- [ ] Implementar pivot das permissões por módulo somente quando o código dinâmico e o contrato UserOrganization/permission comprovarem a transformação; caso contrário pending.

- [ ] Implementar regras confirmed para contratos existentes, com organization_id constante, identidades determinísticas, referências e defaults atuais.

- [ ] Manter pending toda tabela cujo dado não caiba integralmente no contrato atual; não reduzir histórico ou conteúdo livre para um campo incompatível.

- [ ] Testar merges/consolidações de cliente e grupos, uniques atuais, históricos auxiliares e no_code_reference.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/evidence-admin-business.test.mjs docs/migration/v4/scripts/test/rules-admin-business.test.mjs

- [ ] Rodar cobertura acumulada, Biome, git diff --check e commit:

    git add docs/migration/v4/scripts/evidence/admin-business.mjs docs/migration/v4/scripts/rules/admin-business.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/evidence-admin-business.test.mjs docs/migration/v4/scripts/test/rules-admin-business.test.mjs
    git commit -m "feat(migration-v4): map admin and business domains"

---

## Task 7: Revisar Integração e Regularize restantes

**Files:**

- Create: docs/migration/v4/scripts/evidence/integracao-regularize.mjs
- Create: docs/migration/v4/scripts/rules/integracao-regularize.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Create: docs/migration/v4/scripts/test/evidence-integracao-regularize.test.mjs
- Create: docs/migration/v4/scripts/test/rules-integracao-regularize.test.mjs
- Read: /home/bruno/Documents/workspace2/integracao/
- Read: /home/bruno/Documents/workspace2/regularize/
- Read: services/project-service/src/
- Read: services/task-service/src/
- Read: services/regularize-service/src/

**Interfaces:**

- Consumes: V2_EVIDENCE/V2_RULES e registry acumulado.
- Produces: evidência e regras para origens Integração/Regularize não cobertas pela V2.

- [ ] Derivar conjunto esperado do inventário e remover as 13 origens Integração/Regularize já tratadas na Task 3.

- [ ] Escrever teste de cobertura e confirmar RED.

- [ ] Implementar decisões com evidência de CRUD, joins e cardinalidade do legado; tabelas de distrato, solicitações, grupos, agenda, atividades, DTE e catálogos só ficam confirmed com contrato atual comprovado.

- [ ] Testar dependências entre projeto, tarefa, modelo, cliente e departamento; qualquer violação de Task.project.client_id igual a Task.client_id gera quarantine.

- [ ] Testar aggregates JSON e lookups normalizados sem transformar coocorrência de código em FK.

- [ ] Manter históricos e tabelas auxiliares pending quando não houver destino atual fiel.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/evidence-integracao-regularize.test.mjs docs/migration/v4/scripts/test/rules-integracao-regularize.test.mjs

- [ ] Rodar cobertura acumulada, Biome, git diff --check e commit:

    git add docs/migration/v4/scripts/evidence/integracao-regularize.mjs docs/migration/v4/scripts/rules/integracao-regularize.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/evidence-integracao-regularize.test.mjs docs/migration/v4/scripts/test/rules-integracao-regularize.test.mjs
    git commit -m "feat(migration-v4): map remaining integration regularize"

---

## Task 8: Revisar módulos restantes, auxiliares e históricos

**Files:**

- Create: docs/migration/v4/scripts/evidence/remaining.mjs
- Create: docs/migration/v4/scripts/rules/remaining.mjs
- Create: docs/migration/v4/scripts/evidence/index.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Create: docs/migration/v4/scripts/test/evidence-complete.test.mjs
- Create: docs/migration/v4/scripts/test/rules-remaining.test.mjs
- Read: /home/bruno/Documents/workspace2/marketing/
- Read: /home/bruno/Documents/workspace2/pec/
- Read: /home/bruno/Documents/workspace2/triagem/
- Read: /home/bruno/Documents/workspace2/wiki/
- Read: /home/bruno/Documents/workspace2/workspace/
- Read: /home/bruno/Documents/workspace2/backend/

**Interfaces:**

- Consumes: todos os módulos evidence/rules anteriores.
- Produces: buildEvidenceRegistry(groups), REMAINING_EVIDENCE, REMAINING_RULES e cobertura final 312/312.

- [ ] Escrever evidence-complete.test.mjs que compare o conjunto de 312 sourceTable do inventário real com a união de todas as EvidenceDecision.

- [ ] Confirmar RED listando as origens ainda ausentes.

- [ ] Implementar evidência aprofundada de Marketing, PEC, Triagem, Wiki, Workspace e prefixes restantes.

- [ ] Classificar auxiliares/históricos: aggregate/lookup comprovado pode ser confirmed; sem destino fiel permanece pending com LEGACY_AUXILIARY_NO_CURRENT_CONTRACT ou LEGACY_HISTORY_NO_REPLAY_CONTRACT.

- [ ] Classificar oito no_code_reference como pending NO_LEGACY_RUNTIME_REFERENCE, salvo evidência DDL/contrato atual que comprove uso seguro.

- [ ] Criar regra somente para EvidenceDecision confirmed; exigir que cada pending tenha evidence e reason.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/evidence-complete.test.mjs docs/migration/v4/scripts/test/rules-remaining.test.mjs

  Resultado esperado: 312 EvidenceDecision únicas e nenhuma sourceTable sem estado final.

- [ ] Rodar toda a suíte evidence/rules, Biome, git diff --check e commit:

    git add docs/migration/v4/scripts/evidence/remaining.mjs docs/migration/v4/scripts/rules/remaining.mjs docs/migration/v4/scripts/evidence/index.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/evidence-complete.test.mjs docs/migration/v4/scripts/test/rules-remaining.test.mjs
    git commit -m "feat(migration-v4): complete semantic evidence coverage"

---

## Task 9: Implementar o motor multi-destino e os artefatos

**Files:**

- Create: docs/migration/v4/scripts/lib/mapping-engine.mjs
- Create: docs/migration/v4/scripts/build-mapping.mjs
- Create: docs/migration/v4/scripts/test/mapping-engine.test.mjs
- Create: docs/migration/v4/scripts/test/build-mapping-cli.test.mjs
- Modify: docs/migration/v4/scripts/lib/stable-output.mjs
- Modify: docs/migration/v4/scripts/lib/sensitivity.mjs

**Interfaces:**

- Consumes: SourceInventory, EvidenceRegistry, RuleRegistry, PrismaCatalog e iterateSqlRows.
- Produces: buildMapping({ inventory, evidenceRegistry, ruleRegistry, prismaCatalog, sourceDir, capabilities }), validateMappingCompleteness(result, inventory), writeMappingPackage(packageDir, result).

- [ ] Escrever fixture com insert, merge, derived, aggregate e duas emissões independentes em que uma fica quarantine.

- [ ] Confirmar RED porque mapping-engine.mjs não existe.

- [ ] Implementar buildMapping em streaming, acumulando somente métricas e quarantine sanitizada; payload legado não é persistido.

- [ ] Implementar métricas por sourceTable/stepId/destinationTable e fechamento de cada passo em prepared, quarantine ou not_emitted.

- [ ] Implementar artefatos mapping/tables, mapping/destinations, mapping/columns, pending-mapping/tables, quarantine/summary e quarantine/reasons em CSV/JSON determinísticos.

- [ ] Escrever teste da CLI com --source, --legacy-source, --package, --prisma e --expected-tables; não existe flag apply/write-db.

- [ ] Garantir que qualquer padrão de segredo em artefato interrompa a escrita e remova o temporário.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/mapping-engine.test.mjs docs/migration/v4/scripts/test/build-mapping-cli.test.mjs

- [ ] Rodar a suíte V4, Biome, git diff --check e commit:

    git add docs/migration/v4/scripts/lib/mapping-engine.mjs docs/migration/v4/scripts/build-mapping.mjs docs/migration/v4/scripts/test/mapping-engine.test.mjs docs/migration/v4/scripts/test/build-mapping-cli.test.mjs docs/migration/v4/scripts/lib/stable-output.mjs docs/migration/v4/scripts/lib/sensitivity.mjs
    git commit -m "feat(migration-v4): build semantic mapping package"

---

## Task 10: Comparar decisões anteriores com a evidência atual

**Files:**

- Create: docs/migration/v4/scripts/lib/previous-comparison.mjs
- Create: docs/migration/v4/scripts/test/previous-comparison.test.mjs
- Modify: docs/migration/v4/scripts/build-mapping.mjs

**Interfaces:**

- Consumes: inventários atual/históricos, EvidenceRegistry, RuleRegistry e artefatos V2/V3.
- Produces: comparePreviousMappings({ currentInventory, historicalInventories, evidenceRegistry, ruleRegistry, previousArtifacts }).

- [ ] Escrever testes para regra reutilizada, corrigida, invalidada, tabela nova, coluna alterada e contagem divergente.

- [ ] Adicionar regressões das invalidações comprovadas: sócios de orientação não viram Partners/ClientPF; senha de usuário legado recebe bcrypt; clientes Regularize usam cliente_id explícito.

- [ ] Confirmar RED e implementar comparação sem importar/executar scripts apply.

- [ ] Gerar reason e evidence para toda mudança; uma regra anterior não pode prevalecer sobre evidence atual.

- [ ] Rodar teste focado, suíte V4, Biome e git diff --check.

- [ ] Commitar:

    git add docs/migration/v4/scripts/lib/previous-comparison.mjs docs/migration/v4/scripts/test/previous-comparison.test.mjs docs/migration/v4/scripts/build-mapping.mjs
    git commit -m "feat(migration-v4): compare semantic migration decisions"

---

## Task 11: Atualizar o preflight Supabase somente leitura

**Files:**

- Create: docs/migration/v4/scripts/lib/pg-readonly.mjs
- Create: docs/migration/v4/scripts/lib/preflight-engine.mjs
- Create: docs/migration/v4/scripts/preflight.mjs
- Create: docs/migration/v4/scripts/test/pg-readonly.test.mjs
- Create: docs/migration/v4/scripts/test/preflight-engine.test.mjs
- Create: docs/migration/v4/scripts/test/preflight-cli.test.mjs

**Interfaces:**

- Consumes: MappingResult multi-destino, PrismaCatalog, EvidenceRegistry e organizationId.
- Produces: withReadOnlyTransaction(client, callback), runPreflight({ client, mappingPackage, prismaCatalog, organizationId, requiredSecretNames }).

- [ ] Escrever teste de query history: primeira query BEGIN TRANSACTION READ ONLY; somente SELECT/WITH; sucesso COMMIT; erro ROLLBACK.

- [ ] Confirmar RED e implementar assertReadOnlyQuery, createReadOnlyClient e withReadOnlyTransaction.

- [ ] Escrever testes de preflight por destination step: tabela/coluna/tipo/null/unique/FK, tenant scope, ID determinístico, conflito unique, drift Prisma, criptografia e ordem/ciclo.

- [ ] Adicionar blockers PENDING_MAPPING_EXISTS, UNRESOLVED_QUARANTINE_EXISTS, SEMANTIC_EVIDENCE_MISSING, MERGE_IDENTITY_CONFLICT e ENCRYPTION_CONFIGURATION_MISSING.

- [ ] readyForMigration é true somente com zero blockers, zero pending e zero quarantine unresolved em todos os passos.

- [ ] Implementar CLI que aceita somente package, prisma e organization-id; conexão vem de DATABASE_URL ou DIRECT_URL e nunca é registrada.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/pg-readonly.test.mjs docs/migration/v4/scripts/test/preflight-engine.test.mjs docs/migration/v4/scripts/test/preflight-cli.test.mjs

- [ ] Rodar suíte V4, Biome, git diff --check e commit:

    git add docs/migration/v4/scripts/lib/pg-readonly.mjs docs/migration/v4/scripts/lib/preflight-engine.mjs docs/migration/v4/scripts/preflight.mjs docs/migration/v4/scripts/test/pg-readonly.test.mjs docs/migration/v4/scripts/test/preflight-engine.test.mjs docs/migration/v4/scripts/test/preflight-cli.test.mjs
    git commit -m "feat(migration-v4): add semantic read-only preflight"

---

## Task 12: Gerar, documentar e validar o pacote V4 real

**Files:**

- Create: docs/migration/v4/README.md
- Create: docs/migration/v4/manifest.json
- Create: docs/migration/v4/mapping/tables.csv
- Create: docs/migration/v4/mapping/tables.json
- Create: docs/migration/v4/mapping/destinations.csv
- Create: docs/migration/v4/mapping/destinations.json
- Create: docs/migration/v4/mapping/columns.csv
- Create: docs/migration/v4/mapping/columns.json
- Create: docs/migration/v4/pending-mapping/tables.csv
- Create: docs/migration/v4/pending-mapping/tables.json
- Create: docs/migration/v4/quarantine/summary.json
- Create: docs/migration/v4/quarantine/reasons.csv
- Create: docs/migration/v4/reports/source-inventory.json
- Create: docs/migration/v4/reports/legacy-behavior-analysis.json
- Create: docs/migration/v4/reports/legacy-behavior-analysis.md
- Create: docs/migration/v4/reports/semantic-decisions.json
- Create: docs/migration/v4/reports/previous-mapping-comparison.json
- Create: docs/migration/v4/reports/supabase-preflight.json
- Create: docs/migration/v4/scripts/test/package-acceptance.test.mjs

**Interfaces:**

- Consumes: todas as CLIs e contratos das Tasks 1–11.
- Produces: pacote V4 versionado, sanitizado e auditável; nenhum script de limpeza/carga.

- [ ] Escrever package-acceptance.test.mjs antes dos artefatos e confirmar RED por arquivos ausentes.

- [ ] Gerar source-inventory com 312 tabelas.

- [ ] Gerar legacy-behavior-analysis e semantic-decisions com 312 entradas, referências válidas e nenhum confirmed sem contrato atual.

- [ ] Gerar mapping multi-destino, pending, quarantine e comparação histórica:

    node docs/migration/v4/scripts/build-mapping.mjs --source /home/bruno/Documents/03.08.2026 --legacy-source /home/bruno/Documents/workspace2 --package docs/migration/v4 --prisma infra/prisma/schema.prisma --expected-tables 312 --previous-source /home/bruno/Documents/06.07.2026 --previous-source /home/bruno/Documents/10.07.2026 --previous-docs docs/migration

- [ ] Executar preflight real para a Castelo:

    node docs/migration/v4/scripts/preflight.mjs --package docs/migration/v4 --prisma infra/prisma/schema.prisma --organization-id e8048d1c-0830-45d7-84de-68e20abd685b

  Resultado esperado: transactionMode READ ONLY. Pending/quarantine podem produzir readyForMigration false sem falhar a geração.

- [ ] Criar manifest com packageVersion 4, mode dry-run, sourceBackup 03.08.2026, legacySourceLabel workspace2, 312 tabelas, sourceDigest, tenant, namespace, hashes, contagens por estado/modo, preflightExecuted, readyForMigration e writesPerformed false.

- [ ] Escrever README com comandos, hierarquia de evidências, modos de adaptação, leitura dos relatórios, política de segredos e proibição de limpeza/carga.

- [ ] Rodar:

    node --test docs/migration/v4/scripts/test/*.test.mjs

  Resultado esperado: zero falhas.

- [ ] Validar sintaxe:

    find docs/migration/v4/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check

- [ ] Rodar package-acceptance e exigir:

  - 312 origens únicas;
  - cada origem confirmed ou pending;
  - cada origem com evidence;
  - destinos/colunas confirmados no Prisma;
  - toda linha fechada por passo;
  - nenhuma senha/segredo/dado bruto;
  - preflight READ ONLY;
  - writesPerformed false.

- [ ] Revisar amostra de confirmed e pending de cada domínio e todas as sete adaptações V2.

- [ ] Rodar git diff --check, git diff --stat e confirmar que nenhum SQL dump ou .env foi adicionado.

- [ ] Commitar:

    git add docs/migration/v4
    git commit -m "feat(migration-v4): generate semantic legacy mapping package"

---

## Gate de encerramento

- [ ] As 12 tarefas deste plano possuem revisão independente limpa ou findings menores registrados para a revisão final.
- [ ] A suíte V4 completa passou na execução mais recente.
- [ ] Existem exatamente 312 EvidenceDecision e 312 estados finais confirmed/pending.
- [ ] Nenhuma regra confirmada depende apenas de migração anterior.
- [ ] Todos os DestinationStep apontam para contratos existentes.
- [ ] As sete adaptações V2 possuem regressões comportamentais.
- [ ] Pending e quarantine estão sanitizados e possuem motivo/evidência.
- [ ] Preflight real executou em BEGIN TRANSACTION READ ONLY.
- [ ] manifest.json registra writesPerformed false.
- [ ] Nenhuma limpeza, carga ou escrita no banco foi criada ou executada.
- [ ] O diff final não contém dump, credencial, segredo ou arquivo fora de docs/migration/v4.

## Fora deste plano

A limpeza e a carga serão tratadas em outro desenho somente após aprovação de todas as decisões
pending e quarantine. O fluxo futuro preservará o registro da organização Castelo, usará DELETE
tenant-scoped ou relações comprovadas, nunca TRUNCATE, validará antes do COMMIT e exigirá nova
autorização explícita imediatamente antes da primeira escrita.
