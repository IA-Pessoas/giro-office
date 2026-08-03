# Migração V4 — Mapeamento integral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um pacote V4 autocontido que inventarie e classifique as 312 tabelas do backup legado de 03.08.2026, gere mapeamentos e quarentenas auditáveis e valide o destino Supabase em modo estritamente somente leitura.

**Architecture:** Os scripts em docs/migration/v4/scripts serão divididos em bibliotecas pequenas: parser incremental de dumps, inventário, catálogo Prisma, regras por domínio, motor de classificação, comparação histórica, serialização segura e preflight PostgreSQL. As CLIs apenas orquestram essas bibliotecas. Toda tabela de origem terá exatamente uma classificação confirmed ou pending; registros incompatíveis de tabelas confirmadas irão para quarantine. O Supabase será acessado apenas pelo preflight, dentro de BEGIN TRANSACTION READ ONLY.

**Tech Stack:** Node.js ESM, node:test, node:assert/strict, crypto nativo, fs/promises, streams nativos, PostgreSQL via pg já disponível no workspace, Prisma schema como contrato estático, CSV e JSON versionados.

## Global Constraints

- Fonte atual: /home/bruno/Documents/03.08.2026, com exatamente 312 arquivos SQL.
- Fontes históricas somente leitura: /home/bruno/Documents/06.07.2026 e /home/bruno/Documents/10.07.2026.
- Tenant único de destino: Castelo Contabilidade, organization_id e8048d1c-0830-45d7-84de-68e20abd685b.
- Namespace UUID v5 já adotado: 3f68d246-0b54-4a10-9415-a8845a767fb5.
- Todos os novos arquivos, inclusive bibliotecas, regras, testes, fixtures, relatórios e scripts futuros, ficam sob docs/migration/v4/.
- Não alterar infra/prisma/schema.prisma, migrations, serviços, APIs, schemas, tabelas ou contratos existentes.
- Não propor nem inferir novos destinos. Ausência ou ambiguidade de destino resulta em pending-mapping com evidência objetiva.
- Não executar INSERT, UPDATE, DELETE, TRUNCATE, MERGE, COPY, DDL, chamadas RPC mutáveis ou Prisma migrations.
- Não criar nesta entrega scripts de limpeza ou aplicação.
- Não copiar dumps, linhas brutas, senhas, tokens, chaves privadas ou segredos para o repositório.
- TDD em cada tarefa: escrever o teste, confirmar a falha esperada, implementar o mínimo, confirmar a passagem e só então refatorar.
- Cada comando gerador deve falhar com código diferente de zero quando uma invariável estrutural for violada.
- As saídas devem ser ordenadas e reprodutíveis. Datas de execução entram apenas no manifest e nos relatórios de execução; testes injetam um relógio fixo.
- Nenhum commit pode incluir credenciais, URLs com senha ou artefatos temporários.

## Contratos congelados

Os contratos abaixo são definidos antes da implementação para que todas as tarefas usem os mesmos nomes e tipos lógicos.

    LegacyScalar = string | null
    LegacyRow = Record<string, LegacyScalar>

    SqlDumpInspection = {
      sourceTable: string,
      fileName: string,
      relativePath: string,
      fileSizeBytes: number,
      sha256: string,
      columns: string[],
      rowCount: number,
      insertStatementCount: number,
      legacyIdColumn: string | null,
      sensitiveColumns: string[]
    }

    SourceInventory = {
      sourceDirectoryLabel: string,
      expectedTableCount: number,
      actualTableCount: number,
      sourceDigest: string,
      tables: SqlDumpInspection[]
    }

    PrismaField = {
      model: string,
      prismaName: string,
      databaseName: string,
      prismaType: string,
      nullable: boolean,
      list: boolean,
      id: boolean,
      unique: boolean,
      relationModel: string | null,
      relationFields: string[],
      relationReferences: string[]
    }

    PrismaModel = {
      prismaName: string,
      databaseName: string,
      fields: PrismaField[],
      compoundUnique: string[][],
      indexes: string[][]
    }

    MappingRule = {
      sourceTable: string,
      destinationTable: string,
      status: "confirmed",
      domain: string,
      ruleOrigin: string,
      reason: string,
      identity: {
        legacyColumn: string,
        scope: string,
        namespace: string
      },
      dependencies: string[],
      columns: ColumnRule[],
      classifyRow: (row, context) =>
        { status: "prepared" } |
        { status: "quarantine", field: string | null, reasonCode: string }
    }

    TableMapping = {
      sourceTable: string,
      sourceRowCount: number,
      destinationTable: string | null,
      status: "confirmed" | "pending",
      reasonCode: string,
      reason: string,
      domain: string,
      ruleOrigin: string,
      identityStrategy: string | null,
      dependencies: string[],
      preparedRowCount: number,
      quarantineRowCount: number
    }

    ColumnMapping = {
      sourceTable: string,
      sourceColumn: string,
      destinationTable: string | null,
      destinationColumn: string | null,
      status: "mapped" | "pending" | "not_preserved",
      transformation: string,
      nullHandling: string,
      referenceRole: string,
      sensitivity: "none" | "personal" | "credential" | "secret",
      ruleOrigin: string,
      reason: string
    }

    QuarantineItem = {
      sourceTable: string,
      legacyIdRef: string,
      field: string | null,
      reasonCode: string,
      destinationTable: string | null,
      decisionStatus: "unresolved"
    }

    MappingResult = {
      tableMappings: TableMapping[],
      columnMappings: ColumnMapping[],
      pendingTables: TableMapping[],
      quarantineItems: QuarantineItem[],
      quarantineSummary: {
        total: number,
        unresolved: number,
        byReason: Record<string, number>
      }
    }

    PreflightReport = {
      organizationId: string,
      transactionMode: "READ ONLY",
      checks: PreflightCheck[],
      currentTenantCounts: Record<string, number>,
      conflicts: PreflightConflict[],
      dependencyOrder: string[],
      blockers: PreflightBlocker[],
      pendingTableCount: number,
      unresolvedQuarantineCount: number,
      readyForMigration: boolean
    }

Regras adicionais dos contratos:

- iterateSqlRows(filePath) retorna AsyncGenerator<LegacyRow> e nunca carrega o dump inteiro na memória.
- inspectSqlDump(filePath, options) calcula hash, metadados e contagem em uma única passagem lógica pelo arquivo.
- Números do SQL permanecem strings no parser para evitar perda de precisão; a transformação tipada pertence à regra de coluna.
- legacyIdRef preserva apenas IDs numéricos, UUIDs ou alfanuméricos seguros de até 64 caracteres. Qualquer outro valor vira sha256:<digest>.
- sourceDirectoryLabel guarda somente o basename do diretório, nunca o caminho absoluto da máquina.
- readyForMigration é verdadeiro somente quando blockers, pendingTables e quarentenas unresolved estiverem todos zerados.

---

## Task 1: Implementar o parser incremental e a identidade determinística

**Files:**

- Create: docs/migration/v4/scripts/lib/sql-dump-parser.mjs
- Create: docs/migration/v4/scripts/lib/uuid-v5.mjs
- Create: docs/migration/v4/scripts/test/fixtures/parser-basic.sql
- Create: docs/migration/v4/scripts/test/fixtures/parser-escaped.sql
- Create: docs/migration/v4/scripts/test/fixtures/parser-malformed.sql
- Create: docs/migration/v4/scripts/test/sql-dump-parser.test.mjs
- Create: docs/migration/v4/scripts/test/uuid-v5.test.mjs
- Read for behavior: scripts/migration-v2-build-load.mjs
- Read for behavior: scripts/migration-rh-pessoal-v3-dry-run.mjs

- [ ] Criar fixtures pequenas com INSERT de uma e múltiplas linhas, lista explícita de colunas, NULL, aspas escapadas, barra invertida, quebras de linha dentro de string, UTF-8 e ponto e vírgula dentro de valor.

- [ ] Escrever testes de iterateSqlRows e inspectSqlDump que comprovem:

  - valores SQL decodificados como string ou null;
  - ordem e nomes das colunas;
  - múltiplos INSERT acumulados;
  - rowCount e insertStatementCount corretos;
  - nome schema.tabela derivado de tb_schema.tabela.sql;
  - SHA-256 com 64 caracteres hexadecimais;
  - mensagem de erro com arquivo e posição, sem conteúdo integral da linha;
  - iteração por stream, sem uso de readFile no módulo.

- [ ] Rodar o teste do parser e confirmar a falha por módulo ainda inexistente:

    node --test docs/migration/v4/scripts/test/sql-dump-parser.test.mjs

  Resultado esperado: FAIL com ERR_MODULE_NOT_FOUND para sql-dump-parser.mjs.

- [ ] Implementar createSqlTokenizer, iterateSqlRows e inspectSqlDump com fs.createReadStream, StringDecoder e uma máquina de estados que reconheça aspas, escapes, parênteses, NULL e delimitadores fora de strings.

- [ ] Garantir que o parser aceite apenas INSERT INTO e descarte comandos estruturais sem executar nem interpretar DDL.

- [ ] Rodar novamente o teste do parser.

  Resultado esperado: PASS em todos os casos, incluindo malformed sem vazamento do valor completo.

- [ ] Escrever teste de uuidV5 que fixe o namespace e comprove igualdade para a mesma entrada, diferença entre tabelas e IDs distintos e conformidade de versão 5/variant RFC 4122.

- [ ] Rodar o teste e confirmar a falha por módulo ainda inexistente:

    node --test docs/migration/v4/scripts/test/uuid-v5.test.mjs

  Resultado esperado: FAIL com ERR_MODULE_NOT_FOUND para uuid-v5.mjs.

- [ ] Implementar uuidV5(namespace, name) apenas com crypto nativo e validar namespace malformado.

- [ ] Rodar os dois testes.

    node --test docs/migration/v4/scripts/test/sql-dump-parser.test.mjs docs/migration/v4/scripts/test/uuid-v5.test.mjs

  Resultado esperado: PASS.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/lib/sql-dump-parser.mjs docs/migration/v4/scripts/lib/uuid-v5.mjs docs/migration/v4/scripts/test
    git commit -m "feat(migration-v4): add streaming dump parser"

---

## Task 2: Garantir serialização estável e proteção de dados sensíveis

**Files:**

- Create: docs/migration/v4/scripts/lib/stable-output.mjs
- Create: docs/migration/v4/scripts/lib/sensitivity.mjs
- Create: docs/migration/v4/scripts/test/stable-output.test.mjs
- Create: docs/migration/v4/scripts/test/sensitivity.test.mjs

- [ ] Escrever testes de writeStableJson e writeCsv que validem ordenação explícita, newline final, escape CSV RFC 4180, representação de null como vazio e bytes idênticos em duas gerações equivalentes.

- [ ] Escrever testes de isSensitiveColumn, toLegacyIdRef, sanitizeQuarantineItem e assertNoSensitiveValues com nomes em português e inglês:

  - senha, password, passwd, token, secret, chave, private_key, certificado, pfx, pem e reset_token;
  - valor seguro numérico, UUID e alfanumérico curto;
  - ID livre convertido para sha256:<digest>;
  - objeto contendo senha, token JWT, bloco PRIVATE KEY, URL PostgreSQL com credencial e conteúdo PFX rejeitado antes da gravação.

- [ ] Rodar os testes e confirmar ERR_MODULE_NOT_FOUND:

    node --test docs/migration/v4/scripts/test/stable-output.test.mjs docs/migration/v4/scripts/test/sensitivity.test.mjs

- [ ] Implementar writeStableJson(filePath, value), writeCsv(filePath, columns, rows), stableSortObject(value) e gravação atômica por arquivo temporário no mesmo diretório seguido de rename.

- [ ] Implementar isSensitiveColumn(name), classifySensitivity(name), toLegacyIdRef(value), sanitizeQuarantineItem(item) e assertNoSensitiveValues(value).

- [ ] Fazer assertNoSensitiveValues percorrer chaves e valores; os relatórios podem registrar apenas nomes de campos sensíveis e indicadores booleanos, nunca seus valores.

- [ ] Rodar os testes.

    node --test docs/migration/v4/scripts/test/stable-output.test.mjs docs/migration/v4/scripts/test/sensitivity.test.mjs

  Resultado esperado: PASS.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/lib/stable-output.mjs docs/migration/v4/scripts/lib/sensitivity.mjs docs/migration/v4/scripts/test/stable-output.test.mjs docs/migration/v4/scripts/test/sensitivity.test.mjs
    git commit -m "feat(migration-v4): add safe deterministic outputs"

---

## Task 3: Inventariar as 312 tabelas sem copiar dados brutos

**Files:**

- Create: docs/migration/v4/scripts/lib/source-inventory.mjs
- Create: docs/migration/v4/scripts/inventory.mjs
- Create: docs/migration/v4/scripts/test/source-inventory.test.mjs
- Create: docs/migration/v4/scripts/test/inventory-cli.test.mjs
- Modify: docs/migration/v4/scripts/lib/sql-dump-parser.mjs

- [ ] Escrever testes com diretório temporário para buildSourceInventory que validem:

  - seleção exclusiva de arquivos terminados em .sql;
  - ordenação por sourceTable;
  - rejeição de nomes que não sigam schema.tabela.sql;
  - rejeição de sourceTable duplicada mesmo com diferença de caixa;
  - falha quando actualTableCount difere de expectedTableCount;
  - sourceDigest estável calculado a partir de sourceTable, sha256 e rowCount;
  - sourceDirectoryLabel sem caminho absoluto;
  - sensitiveColumns contendo apenas nomes, sem valores.

- [ ] Rodar o teste e confirmar ERR_MODULE_NOT_FOUND:

    node --test docs/migration/v4/scripts/test/source-inventory.test.mjs

- [ ] Implementar buildSourceInventory({ sourceDir, expectedTables }) usando inspectSqlDump para cada arquivo e limite configurável de concorrência sem ler arquivos inteiros em memória.

- [ ] Escrever o teste da CLI com --source, --out e --expected-tables, incluindo saída JSON estável e código diferente de zero para contagem incorreta.

- [ ] Rodar o teste da CLI e confirmar a falha por inventory.mjs ainda incompleto:

    node --test docs/migration/v4/scripts/test/inventory-cli.test.mjs

- [ ] Implementar inventory.mjs com parseArgs nativo, argumentos obrigatórios, mensagens sanitizadas e nenhuma suposição silenciosa sobre diretório ou quantidade.

- [ ] Rodar os testes da tarefa.

    node --test docs/migration/v4/scripts/test/source-inventory.test.mjs docs/migration/v4/scripts/test/inventory-cli.test.mjs

  Resultado esperado: PASS.

- [ ] Executar o inventário real em arquivo temporário fora do pacote para validar parser e contagem sem ainda registrar o relatório definitivo:

    node docs/migration/v4/scripts/inventory.mjs --source /home/bruno/Documents/03.08.2026 --out /tmp/giro-migration-v4-source-inventory.json --expected-tables 312

  Resultado esperado: exit 0, actualTableCount 312 e nenhum dump no repositório.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/lib/source-inventory.mjs docs/migration/v4/scripts/lib/sql-dump-parser.mjs docs/migration/v4/scripts/inventory.mjs docs/migration/v4/scripts/test/source-inventory.test.mjs docs/migration/v4/scripts/test/inventory-cli.test.mjs
    git commit -m "feat(migration-v4): inventory all legacy dumps"

---

## Task 4: Construir o catálogo estático do destino Prisma

**Files:**

- Create: docs/migration/v4/scripts/lib/prisma-catalog.mjs
- Create: docs/migration/v4/scripts/test/fixtures/schema-catalog.prisma
- Create: docs/migration/v4/scripts/test/prisma-catalog.test.mjs
- Read: infra/prisma/schema.prisma

- [ ] Criar fixture Prisma com model, @@map, @map, campo opcional, lista, @id, @unique, @@unique, @@index e @relation com fields/references.

- [ ] Escrever testes de loadPrismaCatalog(schemaPath) que validem os contratos PrismaModel e PrismaField, nomes físicos de tabela/coluna e rejeição de destino inexistente.

- [ ] Rodar o teste e confirmar ERR_MODULE_NOT_FOUND:

    node --test docs/migration/v4/scripts/test/prisma-catalog.test.mjs

- [ ] Implementar um parser estático conservador para blocos model do schema Prisma; ignorar enum, generator e datasource sem executar prisma generate.

- [ ] Implementar getModelByDatabaseName(catalog, table), getFieldByDatabaseName(model, column) e assertRuleMatchesPrisma(rule, catalog).

- [ ] Fazer assertRuleMatchesPrisma rejeitar tabela/coluna inexistente, destino obrigatório sem política de nulo e relação declarada para coluna ausente.

- [ ] Rodar o teste da fixture e um smoke contra o schema real:

    node --test docs/migration/v4/scripts/test/prisma-catalog.test.mjs
    node -e "import('./docs/migration/v4/scripts/lib/prisma-catalog.mjs').then(async m => { const c = await m.loadPrismaCatalog('infra/prisma/schema.prisma'); if (c.models.length === 0) process.exit(1) })"

  Resultado esperado: PASS e exit 0.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/lib/prisma-catalog.mjs docs/migration/v4/scripts/test/fixtures/schema-catalog.prisma docs/migration/v4/scripts/test/prisma-catalog.test.mjs
    git commit -m "feat(migration-v4): catalog prisma destinations"

---

## Task 5: Definir o registro de regras e portar as decisões V2

**Files:**

- Create: docs/migration/v4/scripts/lib/mapping-contract.mjs
- Create: docs/migration/v4/scripts/rules/v2.mjs
- Create: docs/migration/v4/scripts/rules/index.mjs
- Create: docs/migration/v4/scripts/test/mapping-contract.test.mjs
- Create: docs/migration/v4/scripts/test/rules-v2.test.mjs
- Read: docs/migration/v2/confirmed-table-destinations.csv
- Read: docs/migration/v2/transformations/transformations.json
- Read: docs/migration/v2/pending-mapping/tables-without-confirmed-destination.json
- Read: scripts/migration-v2-build-load.mjs
- Read: scripts/migration-v2-phase1-load.mjs
- Read: scripts/migration-v2-phase2-load.mjs

- [ ] Escrever testes de validateMappingRule, buildRuleRegistry e createPendingMapping que comprovem:

  - sourceTable única;
  - status de regra registrada sempre confirmed;
  - destinationTable existente no catálogo Prisma;
  - identity com coluna legada e namespace definidos;
  - toda coluna de destino declarada;
  - colisão entre duas regras para a mesma origem rejeitada;
  - tabela sem regra convertida em pending, nunca ignorada;
  - pending sem sugestão de nova tabela ou serviço.

- [ ] Rodar o teste de contrato e confirmar ERR_MODULE_NOT_FOUND:

    node --test docs/migration/v4/scripts/test/mapping-contract.test.mjs

- [ ] Implementar validateMappingRule, buildRuleRegistry(ruleGroups), createPendingMapping(sourceInspection, reasonCode, evidence) e os reason codes:

  - NO_CONFIRMED_DESTINATION
  - AMBIGUOUS_DESTINATION
  - DESTINATION_CONTRACT_MISMATCH
  - PREVIOUS_RULE_INVALIDATED
  - BUSINESS_DECISION_REQUIRED

- [ ] Escrever testes parametrizados para cada tabela V2 confirmada, conferindo destino, origem da regra, identidade, dependências e mapeamentos de coluna contra os artefatos V2.

- [ ] Adicionar regressões obrigatórias:

  - senha de usuário não pode usar transformação plain nem aparecer em artefato;
  - credencial do Regularize não pode ser preservada sem transformação criptográfica comprovada;
  - regra com destino ausente no Prisma falha;
  - tabela V2 anteriormente pending continua pending salvo se houver contrato atual explicitamente validado.

- [ ] Rodar o teste de V2 e confirmar falha até as regras existirem:

    node --test docs/migration/v4/scripts/test/rules-v2.test.mjs

- [ ] Implementar rules/v2.mjs com regras explícitas e ruleOrigin apontando para o arquivo V2 ou script de origem. Não executar nem importar scripts apply.

- [ ] Implementar rules/index.mjs exportando buildRuleRegistry sem efeitos colaterais.

- [ ] Rodar os testes da tarefa.

    node --test docs/migration/v4/scripts/test/mapping-contract.test.mjs docs/migration/v4/scripts/test/rules-v2.test.mjs

  Resultado esperado: PASS.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/lib/mapping-contract.mjs docs/migration/v4/scripts/rules/v2.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/mapping-contract.test.mjs docs/migration/v4/scripts/test/rules-v2.test.mjs
    git commit -m "feat(migration-v4): port validated v2 mapping rules"

---

## Task 6: Portar e endurecer as regras de RH e Departamento Pessoal

**Files:**

- Create: docs/migration/v4/scripts/rules/rh-pessoal.mjs
- Create: docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Read: docs/migration/v3/rh-pessoal-dry-run.md
- Read: scripts/migration-rh-pessoal-v3-dry-run.mjs
- Read: scripts/apply-rh-pessoal-v3-current-tenant.mjs
- Read: scripts/fix-rh-request-requesters.mjs
- Read: infra/prisma/schema.prisma

- [ ] Extrair para o teste a lista exata de tabelas SOURCE_TABLES e QUARANTINE_ONLY do dry-run V3; não depender de import com efeito colateral.

- [ ] Escrever testes parametrizados garantindo que cada tabela V3 está registrada como confirmed ou produz pending/quarantine com motivo explícito.

- [ ] Adicionar testes de regressão para:

  - UUID v5 usar schema.tabela + id legado;
  - requester de solicitação RH usar a reconciliação corrigida e nunca fallback arbitrário;
  - responsável/assignee ausente respeitar a nulabilidade real do Prisma;
  - referência de usuário não encontrada gerar quarantine USER_REFERENCE_NOT_FOUND;
  - CPF, RG, conteúdo livre e senhas não aparecerem em quarantine;
  - registros de tabelas QUARANTINE_ONLY não serem contados como prepared;
  - credenciais de Pessoal e Regularize exigirem transformação criptográfica ou quarantine CREDENTIAL_REQUIRES_ENCRYPTION.

- [ ] Rodar o teste e confirmar falha enquanto as regras não existem:

    node --test docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs

- [ ] Implementar rules/rh-pessoal.mjs com os destinos existentes, regras de coluna, dependências, classifyRow e ruleOrigin por tabela.

- [ ] Atualizar rules/index.mjs para incluir o grupo sem permitir colisão com V2.

- [ ] Rodar os testes de V2 e RH/Pessoal juntos.

    node --test docs/migration/v4/scripts/test/rules-v2.test.mjs docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs

  Resultado esperado: PASS e zero colisões.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/rules/rh-pessoal.mjs docs/migration/v4/scripts/rules/index.mjs docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs
    git commit -m "feat(migration-v4): port rh and pessoal mapping rules"

---

## Task 7: Portar Tecnologia, Certificados e Parcelamento

**Files:**

- Create: docs/migration/v4/scripts/rules/tecnologia.mjs
- Create: docs/migration/v4/scripts/rules/certificates.mjs
- Create: docs/migration/v4/scripts/rules/parcelamento.mjs
- Create: docs/migration/v4/scripts/test/rules-specialized.test.mjs
- Modify: docs/migration/v4/scripts/rules/index.mjs
- Read: scripts/apply-tecnologia-v1-current-tenant.mjs
- Read: scripts/migration-certificates-v1-dry-run.mjs
- Read: scripts/apply-certificates-v1-current-tenant.mjs
- Read: scripts/apply-parcelamento-v1-current-tenant.mjs
- Read: infra/prisma/schema.prisma

- [ ] Escrever testes parametrizados cobrindo todas as tabelas de origem declaradas nos quatro scripts anteriores e seus destinos físicos atuais.

- [ ] Adicionar regressões de Tecnologia:

  - senha ou token sem criptografia comprovada gera TI_CREDENTIAL_REQUIRES_ENCRYPTION;
  - reset token nunca é serializado;
  - categoria, estoque, termo e robô respeitam uniques e dependências atuais;
  - usuário ou cliente não reconciliado gera referência em quarantine.

- [ ] Adicionar regressões de Certificados:

  - data inválida gera CERTIFICATE_INVALID_DATE;
  - segredo do certificado, PFX, PEM e senha nunca aparecem em saída;
  - duplicidade pela identidade atual gera CERTIFICATE_IDENTITY_CONFLICT;
  - ausência de arquivo/metadata obrigatória usa quarantine, sem inventar storage ou serviço.

- [ ] Adicionar regressões de Parcelamento:

  - identidade do acordo segue o índice atual;
  - empresa ou responsável ausente gera quarantine;
  - estado legado sem correspondência fica pending ou quarantine BUSINESS_DECISION_REQUIRED;
  - nenhuma regra cria novo status, tabela ou serviço.

- [ ] Rodar o teste e confirmar falha antes da implementação:

    node --test docs/migration/v4/scripts/test/rules-specialized.test.mjs

- [ ] Implementar os três módulos de regra com destino, coluna, identidade, dependências, transformações e reason codes explícitos.

- [ ] Atualizar rules/index.mjs e validar colisões entre todos os grupos.

- [ ] Rodar toda a suíte de regras.

    node --test docs/migration/v4/scripts/test/rules-v2.test.mjs docs/migration/v4/scripts/test/rules-rh-pessoal.test.mjs docs/migration/v4/scripts/test/rules-specialized.test.mjs

  Resultado esperado: PASS.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/rules docs/migration/v4/scripts/test/rules-specialized.test.mjs
    git commit -m "feat(migration-v4): port specialized mapping rules"

---

## Task 8: Implementar o motor integral de mapping, pending e quarantine

**Files:**

- Create: docs/migration/v4/scripts/lib/mapping-engine.mjs
- Create: docs/migration/v4/scripts/build-mapping.mjs
- Create: docs/migration/v4/scripts/test/mapping-engine.test.mjs
- Create: docs/migration/v4/scripts/test/build-mapping-cli.test.mjs
- Modify: docs/migration/v4/scripts/lib/stable-output.mjs
- Modify: docs/migration/v4/scripts/lib/sensitivity.mjs

- [ ] Escrever testes de buildMapping({ inventory, prismaCatalog, ruleRegistry, sourceDir }) com três tabelas sintéticas:

  - uma confirmed sem erro produz prepared;
  - uma confirmed com linha inválida produz quarantine;
  - uma sem regra produz pending;
  - a soma de confirmed e pending equivale ao total do inventário;
  - cada sourceTable aparece exatamente uma vez;
  - tabela pending não produz prepared nem quarantine de linha;
  - cada coluna de origem aparece em columnMappings;
  - coluna sem destino explícito recebe pending ou not_preserved com razão;
  - preparedRowCount + quarantineRowCount equivale à contagem da tabela confirmed;
  - quarantine contém somente legacyIdRef e metadados mínimos.

- [ ] Rodar o teste e confirmar ERR_MODULE_NOT_FOUND:

    node --test docs/migration/v4/scripts/test/mapping-engine.test.mjs

- [ ] Implementar buildMapping e validateMappingCompleteness; processar linhas por AsyncGenerator e acumular apenas contagens e quarentenas sanitizadas.

- [ ] Implementar writeMappingPackage(packageDir, result) gerando:

  - mapping/tables.csv
  - mapping/tables.json
  - mapping/columns.csv
  - mapping/columns.json
  - pending-mapping/tables.csv
  - pending-mapping/tables.json
  - quarantine/summary.json
  - quarantine/reasons.csv

- [ ] Escrever teste da CLI com --source, --package, --prisma e --expected-tables. O teste deve falhar se qualquer tabela for ignorada ou se um artefato contiver padrão sensível.

- [ ] Rodar o teste da CLI e confirmar a falha até build-mapping.mjs existir:

    node --test docs/migration/v4/scripts/test/build-mapping-cli.test.mjs

- [ ] Implementar build-mapping.mjs sem flags --apply, --write-db ou equivalentes. Aceitar somente os argumentos locais documentados.

- [ ] Fazer a CLI sempre executar assertNoSensitiveValues antes de cada escrita e validateMappingCompleteness antes de finalizar.

- [ ] Rodar os testes da tarefa.

    node --test docs/migration/v4/scripts/test/mapping-engine.test.mjs docs/migration/v4/scripts/test/build-mapping-cli.test.mjs

  Resultado esperado: PASS.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/lib/mapping-engine.mjs docs/migration/v4/scripts/lib/stable-output.mjs docs/migration/v4/scripts/lib/sensitivity.mjs docs/migration/v4/scripts/build-mapping.mjs docs/migration/v4/scripts/test/mapping-engine.test.mjs docs/migration/v4/scripts/test/build-mapping-cli.test.mjs
    git commit -m "feat(migration-v4): build complete mapping package"

---

## Task 9: Comparar o backup atual com decisões e backups anteriores

**Files:**

- Create: docs/migration/v4/scripts/lib/previous-comparison.mjs
- Create: docs/migration/v4/scripts/test/previous-comparison.test.mjs
- Modify: docs/migration/v4/scripts/build-mapping.mjs
- Read: docs/migration/v2/manifest.json
- Read: docs/migration/v2/confirmed-table-destinations.csv
- Read: docs/migration/v2/transformations/transformations.json
- Read: docs/migration/v3/rh-pessoal-dry-run.md

- [ ] Escrever testes de comparePreviousMappings({ currentInventory, historicalInventories, ruleRegistry, previousArtifacts }) que validem por sourceTable:

  - regra anterior encontrada ou ausente;
  - colunas adicionadas e removidas;
  - contagens por 06.07.2026, 10.07.2026 e 03.08.2026;
  - delta entre backups;
  - regra V4 reutilizada, alterada ou invalidada;
  - motivo obrigatório para mudança de classificação;
  - tabela atual ausente no conjunto histórico ainda aparece no relatório.

- [ ] Rodar o teste e confirmar ERR_MODULE_NOT_FOUND:

    node --test docs/migration/v4/scripts/test/previous-comparison.test.mjs

- [ ] Implementar comparePreviousMappings com leitura dos artefatos anteriores como dados, sem importar ou executar scripts apply.

- [ ] Adicionar à CLI os argumentos repetíveis:

    --previous-source /home/bruno/Documents/06.07.2026
    --previous-source /home/bruno/Documents/10.07.2026
    --previous-docs docs/migration

- [ ] Gerar reports/previous-mapping-comparison.json por writeStableJson e validar que nenhuma linha bruta ou segredo foi copiado.

- [ ] Rodar o teste.

    node --test docs/migration/v4/scripts/test/previous-comparison.test.mjs docs/migration/v4/scripts/test/build-mapping-cli.test.mjs

  Resultado esperado: PASS.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/lib/previous-comparison.mjs docs/migration/v4/scripts/build-mapping.mjs docs/migration/v4/scripts/test/previous-comparison.test.mjs docs/migration/v4/scripts/test/build-mapping-cli.test.mjs
    git commit -m "feat(migration-v4): compare previous migration mappings"

---

## Task 10: Implementar o preflight Supabase estritamente somente leitura

**Files:**

- Create: docs/migration/v4/scripts/lib/pg-readonly.mjs
- Create: docs/migration/v4/scripts/lib/preflight-engine.mjs
- Create: docs/migration/v4/scripts/preflight.mjs
- Create: docs/migration/v4/scripts/test/pg-readonly.test.mjs
- Create: docs/migration/v4/scripts/test/preflight-engine.test.mjs
- Create: docs/migration/v4/scripts/test/preflight-cli.test.mjs
- Read for pg loading only: scripts/apply-rh-pessoal-v3-current-tenant.mjs
- Read: infra/prisma/schema.prisma

- [ ] Escrever teste com cliente PostgreSQL falso para withReadOnlyTransaction(client, callback):

  - primeira query após conexão é exatamente BEGIN TRANSACTION READ ONLY;
  - sucesso termina em COMMIT;
  - erro termina em ROLLBACK;
  - callback não recebe método de escrita;
  - assertReadOnlyQuery permite SELECT e WITH que terminem em SELECT;
  - assertReadOnlyQuery rejeita INSERT, UPDATE, DELETE, TRUNCATE, COPY, MERGE, CREATE, ALTER, DROP, GRANT, REVOKE, CALL, DO e SELECT FOR UPDATE/SHARE.

- [ ] Rodar o teste e confirmar ERR_MODULE_NOT_FOUND:

    node --test docs/migration/v4/scripts/test/pg-readonly.test.mjs

- [ ] Implementar loadPg(), createReadOnlyClient({ databaseUrl }), assertReadOnlyQuery(sql) e withReadOnlyTransaction(client, callback). Reutilizar apenas o padrão de resolução do pacote pg, sem importar scripts apply.

- [ ] Escrever teste de runPreflight com catálogo PostgreSQL falso cobrindo:

  - tabela e coluna inexistente;
  - tipo ou nulabilidade divergente;
  - unique e FK ausentes;
  - distribuição de organization_id;
  - contagem atual da Castelo;
  - ID determinístico já presente;
  - colisão de unique;
  - diferença entre Prisma e catálogo real;
  - variável de criptografia ausente registrada apenas pelo nome;
  - ordem topológica das dependências;
  - ciclo de dependência como blocker;
  - readyForMigration falso com pending ou quarantine unresolved;
  - readyForMigration verdadeiro somente no cenário integralmente limpo.

- [ ] Rodar o teste e confirmar ERR_MODULE_NOT_FOUND:

    node --test docs/migration/v4/scripts/test/preflight-engine.test.mjs

- [ ] Implementar as consultas somente SELECT contra pg_catalog e information_schema e runPreflight({ client, mappingPackage, prismaCatalog, organizationId, requiredSecretNames }).

- [ ] Definir blockers normalizados:

  - DESTINATION_TABLE_MISSING
  - DESTINATION_COLUMN_MISSING
  - DESTINATION_TYPE_MISMATCH
  - DESTINATION_NULLABILITY_MISMATCH
  - DESTINATION_UNIQUE_MISMATCH
  - DESTINATION_FK_MISMATCH
  - PRISMA_DATABASE_DRIFT
  - TENANT_SCOPE_UNPROVEN
  - DETERMINISTIC_ID_CONFLICT
  - UNIQUE_VALUE_CONFLICT
  - ENCRYPTION_CONFIGURATION_MISSING
  - DEPENDENCY_CYCLE
  - PENDING_MAPPING_EXISTS
  - UNRESOLVED_QUARANTINE_EXISTS

- [ ] Escrever teste da CLI garantindo que:

  - organization-id é obrigatório e deve ser exatamente o da Castelo nesta V4;
  - conexão vem de DATABASE_URL, com fallback para DIRECT_URL;
  - URL e senha nunca aparecem em stdout, stderr ou JSON;
  - saída é reports/supabase-preflight.json;
  - não existe flag de aplicação;
  - pendências geram readyForMigration false, mas exit 0 quando o preflight técnico conclui;
  - erro de conexão ou violação read-only gera exit diferente de zero.

- [ ] Implementar preflight.mjs com carregamento local de .env apenas se o padrão já existir no repositório; não registrar valores de ambiente.

- [ ] Rodar os testes da tarefa.

    node --test docs/migration/v4/scripts/test/pg-readonly.test.mjs docs/migration/v4/scripts/test/preflight-engine.test.mjs docs/migration/v4/scripts/test/preflight-cli.test.mjs

  Resultado esperado: PASS e o histórico de queries falso contém apenas BEGIN TRANSACTION READ ONLY, SELECT, COMMIT ou ROLLBACK.

- [ ] Commitar a unidade:

    git add docs/migration/v4/scripts/lib/pg-readonly.mjs docs/migration/v4/scripts/lib/preflight-engine.mjs docs/migration/v4/scripts/preflight.mjs docs/migration/v4/scripts/test/pg-readonly.test.mjs docs/migration/v4/scripts/test/preflight-engine.test.mjs docs/migration/v4/scripts/test/preflight-cli.test.mjs
    git commit -m "feat(migration-v4): add read-only supabase preflight"

---

## Task 11: Gerar o pacote real V4, documentar e validar integralmente

**Files:**

- Create: docs/migration/v4/README.md
- Create: docs/migration/v4/manifest.json
- Create: docs/migration/v4/mapping/tables.csv
- Create: docs/migration/v4/mapping/tables.json
- Create: docs/migration/v4/mapping/columns.csv
- Create: docs/migration/v4/mapping/columns.json
- Create: docs/migration/v4/pending-mapping/tables.csv
- Create: docs/migration/v4/pending-mapping/tables.json
- Create: docs/migration/v4/quarantine/summary.json
- Create: docs/migration/v4/quarantine/reasons.csv
- Create: docs/migration/v4/reports/source-inventory.json
- Create: docs/migration/v4/reports/previous-mapping-comparison.json
- Create: docs/migration/v4/reports/supabase-preflight.json
- Create: docs/migration/v4/scripts/test/package-acceptance.test.mjs
- Modify: docs/migration/v4/scripts/inventory.mjs
- Modify: docs/migration/v4/scripts/build-mapping.mjs
- Modify: docs/migration/v4/scripts/preflight.mjs

- [ ] Escrever package-acceptance.test.mjs para validar os artefatos reais:

  - source-inventory actualTableCount e expectedTableCount iguais a 312;
  - 312 sourceTable distintas em mapping/tables.json;
  - cada tabela exactly confirmed ou pending;
  - confirmed + pending igual a 312;
  - nenhuma tabela ausente entre inventário e mapping;
  - cada tabela pending possui reasonCode e evidência;
  - cada coluna inventariada aparece em columns.json;
  - cada regra confirmed aponta para tabela e colunas existentes no catálogo Prisma;
  - contagens de prepared e quarantine fecham por tabela confirmed;
  - quarantine contém apenas os campos do contrato sanitizado;
  - comparação histórica contém as 312 tabelas atuais;
  - manifest fixa tenant, fonte 03.08.2026, hashes, contagens e estado dry-run;
  - relatório preflight declara transactionMode READ ONLY;
  - readyForMigration segue a fórmula congelada;
  - nenhuma saída contém padrões de senha, token, chave, URL com credencial, PFX, PEM ou conteúdo bruto.

- [ ] Rodar o acceptance antes da geração e confirmar falha por artefatos ausentes:

    node --test docs/migration/v4/scripts/test/package-acceptance.test.mjs

- [ ] Gerar o inventário definitivo:

    node docs/migration/v4/scripts/inventory.mjs --source /home/bruno/Documents/03.08.2026 --out docs/migration/v4/reports/source-inventory.json --expected-tables 312

  Resultado esperado: exit 0 e 312 tabelas.

- [ ] Gerar mapping, pending, quarantine e comparação histórica:

    node docs/migration/v4/scripts/build-mapping.mjs --source /home/bruno/Documents/03.08.2026 --package docs/migration/v4 --prisma infra/prisma/schema.prisma --expected-tables 312 --previous-source /home/bruno/Documents/06.07.2026 --previous-source /home/bruno/Documents/10.07.2026 --previous-docs docs/migration

  Resultado esperado: exit 0, 312 tabelas classificadas e nenhuma escrita no banco.

- [ ] Executar o preflight real contra o Supabase atual:

    node docs/migration/v4/scripts/preflight.mjs --package docs/migration/v4 --prisma infra/prisma/schema.prisma --organization-id e8048d1c-0830-45d7-84de-68e20abd685b

  Resultado esperado: exit 0 se a consulta técnica terminar; reports/supabase-preflight.json registra READ ONLY e provavelmente readyForMigration false enquanto houver pending ou quarantine unresolved.

- [ ] Se DATABASE_URL e DIRECT_URL estiverem ausentes, não inventar credencial nem omitir o preflight. Registrar no manifest que a geração local concluiu e interromper esta tarefa antes do commit até a conexão somente leitura estar disponível.

- [ ] Criar manifest.json com:

  - packageVersion: 4;
  - mode: dry-run;
  - sourceBackup: 03.08.2026;
  - expectedTableCount e actualTableCount;
  - sourceDigest;
  - organizationName e organizationId;
  - uuidNamespace;
  - generatedAt em ISO-8601;
  - artefatos com SHA-256;
  - contagens confirmed, pending, prepared e quarantine;
  - preflightExecuted;
  - readyForMigration;
  - writesPerformed: false.

- [ ] Escrever README.md com pré-requisitos, comandos exatos, significado de confirmed/pending/prepared/quarantine, leitura dos relatórios, política de segredos e a proibição explícita de usar o pacote para limpeza/carga.

- [ ] Documentar no README que a limpeza futura preservará somente a organização Castelo, excluirá os demais dados operacionais desse tenant com DELETE escopado e exigirá novo desenho e nova autorização. Não implementar esse fluxo.

- [ ] Rodar a suíte completa:

    node --test docs/migration/v4/scripts/test/*.test.mjs

  Resultado esperado: PASS em todos os testes.

- [ ] Validar sintaxe de todos os módulos:

    find docs/migration/v4/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check

  Resultado esperado: exit 0.

- [ ] Confirmar por busca estática que a área V4 não contém operações proibidas fora dos testes que verificam rejeição:

    rg -n --glob '!scripts/test/**' '\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|COPY|CREATE TABLE|ALTER TABLE|DROP TABLE|prisma migrate)\b' docs/migration/v4

  Resultado esperado: nenhuma ocorrência em código executável. Ocorrências explicativas em DESIGN.md, IMPLEMENTATION_PLAN.md e README.md devem ser revisadas manualmente e não contam como execução.

- [ ] Confirmar que nenhum dump ou segredo foi adicionado:

    git status --short
    git diff --check
    git diff --stat

  Resultado esperado: somente arquivos sob docs/migration/v4, nenhum .sql de backup, nenhum .env e nenhum erro de whitespace.

- [ ] Rodar novamente package-acceptance após todos os relatórios:

    node --test docs/migration/v4/scripts/test/package-acceptance.test.mjs

  Resultado esperado: PASS.

- [ ] Revisar manualmente uma amostra de pelo menos uma tabela confirmed e uma pending de cada domínio registrado, conferindo origem, destino, colunas, reasonCode, contagens e ausência de valores sensíveis.

- [ ] Commitar o pacote completo:

    git add docs/migration/v4
    git commit -m "feat(migration-v4): generate full legacy mapping package"

---

## Gate de encerramento

A implementação só pode ser declarada concluída quando todos os itens abaixo forem verdadeiros:

- [ ] Os testes completos e package-acceptance passaram na execução mais recente.
- [ ] O inventário real contém exatamente 312 tabelas.
- [ ] As 312 tabelas estão classificadas uma única vez em confirmed ou pending.
- [ ] Todas as colunas de origem estão mapeadas, marcadas pending ou not_preserved com motivo.
- [ ] Quarentenas estão sanitizadas e possuem reasonCode e decisionStatus.
- [ ] O preflight real foi executado em BEGIN TRANSACTION READ ONLY para a Castelo.
- [ ] manifest.json registra writesPerformed false.
- [ ] Nenhum arquivo fora de docs/migration/v4 foi alterado pela implementação.
- [ ] Nenhuma operação de limpeza ou carga foi criada ou executada.
- [ ] O diff final foi revisado e não contém segredo, dump ou credencial.

## Etapa posterior, fora deste plano

Somente após a aprovação dos mapeamentos pending e das decisões de quarantine será escrito outro plano para backup, limpeza tenant-scoped e carga. Esse plano futuro deverá preservar o registro da organização Castelo, remover os demais dados operacionais do tenant com DELETE baseado em organization_id ou relações comprovadas, proibir TRUNCATE, validar tudo antes do COMMIT e solicitar autorização explícita imediatamente antes da primeira escrita.
