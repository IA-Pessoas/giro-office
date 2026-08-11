# Migração V4 — Castelo Contabilidade

Este diretório contém o mapeamento semântico auditável do backup `03.08.2026` do sistema legado
para os contratos já existentes do Giro Office. O comando permanece em `dry-run` por padrão e não
altera dados, schema, tabelas ou serviços. O modo mutável existe somente atrás dos guards descritos
abaixo e não está autorizado enquanto o dry-run conectado continuar incompleto.

## Identidade e estado do pacote

- Organização: Castelo Contabilidade (`e8048d1c-0830-45d7-84de-68e20abd685b`).
- Namespace: `castelo-contabilidade`.
- Origem: 312 dumps, 1.374.880 linhas inventariadas.
- Estados finais: 103 origens `confirmed` e 209 `pending`.
- Exclusões operacionais: os domínios `marketing` (`tb_mkt.*`) e `triage` (`tb_triagem.*`) ficam
  como `notEmitted`/“não migrados”, sem entrar na carga.
- Passos de destino: 133, sendo 90 `insert`, 21 `merge`, 14 `derived`, 4 `lookup` e 4
  `aggregate`.
- Digest da origem: `e76a761406a4cc2e2aa2cae959c51be79c59a968f06a12f0702f3233876cb742`.
- Preflight estrutural real: executado em `READ ONLY`, sem escrita, com
  `readyForMigration=true` e zero blockers.

As 209 origens `pending` ficam deliberadamente fora da carga e entram em `quarantine` até revisão
humana por caso. Nenhuma pendência é resolvida pela criação de tabela ou serviço: ela permanece
registrada em `pending-mapping/`. Quarentenas das origens confirmadas ficam em `quarantine/` até
serem corrigidas ou removidas antes da carga.

A exclusão operacional atual adiciona 341 linhas de `tb_mkt.*` e 1.185 linhas de `tb_triagem.*` à
lista de “não migrados”. Com essas exclusões, a quarentena funcional fica em 15.518 registros;
o detalhamento está em `reports/operational-quarantine-summary.json`.

## Hierarquia de evidências

As decisões seguem esta ordem:

1. comportamento executável do legado em `workspace2`;
2. schema e serviços atuais do repositório;
3. estrutura e contagens do backup `03.08.2026`;
4. migrações V2/V3 somente como comparação histórica, nunca como prova suficiente.

`reports/legacy-behavior-analysis.*` registra a varredura mecânica do legado.
`reports/semantic-decisions.json` é a saída canônica do `EvidenceRegistry` autenticado e contém
exatamente uma decisão para cada origem. `reports/previous-mapping-comparison.json` descreve a
comparação com os backups/documentos anteriores sem importar decisões antigas como verdade atual.

## Como ler os mapeamentos

- `mapping/tables.*`: estado e totais de cada origem confirmada.
- `mapping/destinations.*`: passos multi-destino, dependências, identidade, modo e fechamento das
  linhas.
- `mapping/columns.*`: coluna legada mapeada ou `not_preserved` com justificativa objetiva;
  `sourceColumn=null` identifica valor derivado/resolvido, não dado ausente do inventário.
- `pending-mapping/tables.*`: origens sem contrato atual comprovado, sempre com motivo e evidência.
- `quarantine/*`: motivos agregados e sanitizados; nunca armazena linha ou valor bruto.
- `preflight/*`: bloqueios conhecidos antes da conexão real.
- `reports/supabase-preflight.json`: verificação real do catálogo, tenant, conflitos e drift.
- `manifest.json`: identidade, métricas e hashes SHA-256 dos artefatos auditáveis.

Os modos têm semânticas distintas: `insert` cria uma identidade planejada; `merge` complementa uma
identidade atual comprovada; `lookup` exige resolução única; `derived` cria previamente um contrato
necessário; e `aggregate` reúne linhas filhas em um único campo do contrato existente.

## Resultado do preflight e do dry-run

O preflight consultou 101 tabelas do schema `public` dentro de uma transação
`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`. Todos os cinco requisitos locais de
criptografia foram detectados como configurados, sem registrar valores. Os 133 passos passaram sem
blocker estrutural, de tenant, merge, nulabilidade ou drift.

O dry-run somente com backup executou as regras das 103 origens confirmadas e registrou:

- 616.988 linhas de origem preparadas, 745.568 não emitidas e 12.324 em quarentena;
- 677.058 estados de destino preparados, 807.591 não emitidos e 12.623 em quarentena;
- 632.729 escritas esperadas e `writesPerformed=false`;
- zero fontes sem classificação e 146 grupos sanitizados em `quarantine/reasons.csv`.

Esse resultado ainda é `complete=false`: 452 referências obrigatórias não foram resolvidas e parte
dos motivos depende da leitura do estado atual do banco. A repetição conectada não foi concluída
nesta sessão porque o ambiente de execução externo atingiu o limite de uso até 12/08/2026 às
08:05. Os números acima são, portanto, o registro conservador da passagem somente com o backup e
não autorizam limpeza nem carga.

## Revisão determinística por domínio

A revisão conferiu evidência, regra, destino físico e fechamento de linha da primeira origem
ordenada de cada domínio confirmado:

`tb_contabil.clientes_mov`, `tb_admin.departamentos`, `tb_certificados.pf`,
`tb_integracao.clientes`, `tb_fiscal.icms`, `tb_rh.alergias`, `tb_integracao.grupos`,
`tb_mkt.redes_sociais`, `tb_cbc.panorama_parcelamentos`, `tb_pec.notas`, `tb_pessoal.bem`,
`tb_regularize.alvaras`, `tb_cbc.emails`, `tb_cbs.estoque`, `tb_tecnologia.senhas`,
`tb_cbs.estoque_inventario`, `tb_workspace.solicitacoes`, `tb_tecnologia.estoque`,
`tb_tecnologia.termos` e `tb_triagem.campos`.

Para pending, a revisão conferiu o motivo/evidência da primeira origem ordenada de cada namespace
legado presente: `tb.atendimento_documentos`, `tb_admin.permissoes`,
`tb_atendimento.atendimentos_opa`, `tb_cbc.atas`, `tb_cbs.estoque_andares`,
`tb_certificados.notificacoes.vencimento_certificados`, `tb_comercial.cobrancas_descricao`,
`tb_contabil.alteracoes_contabil`, `tb_financeiro.contratos`,
`tb_fiscal.aliquota_interestadual`, `tb_historico`, `tb_integracao.admin_tarefas`,
`tb_mkt.controle_ia`, `tb_parcelamento.simulacoes`, `tb_pessoal.atividades`,
`tb_regularize.agenda`, `tb_rh.andares`, `tb_tecnologia.atualizacoes`,
`tb_triagem.justificativas`, `tb_wiki.agenda` e `tb_workspace.alteracao_regimes`.

## Sete adaptações V2 revisadas

As sete topologias que não são cópias diretas foram revalidadas contra legado, Prisma e testes
comportamentais:

- `tb_rh.colaboradores`: dois merges controlados no usuário administrativo, incluindo cargo
  resolvido.
- `tb_regularize.clientes`: merge somente por vínculo explícito ou insert próprio sem vínculo.
- `tb_integracao.prospeccao_comercial`: merge da faceta de cliente e insert de projeto.
- `tb_integracao.tarefas`: lookup/derivação de modelo e projeto antes do insert da tarefa.
- `tb_regularize.orientaoes_processual`: lookup de processo ou processo técnico derivado antes da
  orientação.
- `tb_regularize.orientaoes_processual.socios`: aggregate exclusivo em
  `regularize.proceduralGuidances.partners`.
- `tb_regularize.clientes_senhas`: nove sites derivados e dez credenciais, com criptografia exigida
  por emissão e sem valor bruto no pacote.

## Reprodução

Inventário:

```sh
node docs/migration/v4/scripts/inventory.mjs --source /home/bruno/Documents/03.08.2026 --out docs/migration/v4/reports/source-inventory.json --expected-tables 312
```

Análise do legado:

```sh
node docs/migration/v4/scripts/analyze-legacy.mjs --legacy-source /home/bruno/Documents/workspace2 --source /home/bruno/Documents/03.08.2026 --prisma infra/prisma/schema.prisma --out-json docs/migration/v4/reports/legacy-behavior-analysis.json --out-md docs/migration/v4/reports/legacy-behavior-analysis.md --expected-tables 312
```

Mapeamento:

```sh
node docs/migration/v4/scripts/build-mapping.mjs --source /home/bruno/Documents/03.08.2026 --legacy-source /home/bruno/Documents/workspace2 --package docs/migration/v4 --prisma infra/prisma/schema.prisma --expected-tables 312 --previous-source /home/bruno/Documents/06.07.2026 --previous-source /home/bruno/Documents/10.07.2026 --previous-docs docs/migration
```

Preflight real — os arquivos apenas fornecem configuração ao processo; seus valores nunca devem
ser exibidos ou versionados:

```sh
node --env-file=/home/bruno/Documents/Projects/giro-office/services/certificate-service/.env --env-file=/home/bruno/Documents/Projects/giro-office/services/pessoal-service/.env --env-file=/home/bruno/Documents/Projects/giro-office/infra/.env docs/migration/v4/scripts/preflight.mjs --package docs/migration/v4 --prisma infra/prisma/schema.prisma --organization-id e8048d1c-0830-45d7-84de-68e20abd685b
```

Validação:

```sh
node --test docs/migration/v4/scripts/test/*.test.mjs
find docs/migration/v4/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
```

## Comando transacional da migração

O dry-run é o modo padrão e nunca cria um cliente mutável:

```sh
pnpm migration:v4:dry-run
```

A saída sempre registra `mode="dry-run"` e `writesPerformed=false`. Sem uma URL somente leitura, o
comando gera o relatório conservador baseado no backup. Com `MIGRATION_READONLY_DATABASE_URL`, ele
abre uma transação `REPEATABLE READ READ ONLY`, carrega apenas o estado necessário do tenant Castelo
e resolve os lookups/merges dependentes do destino. O CLI rejeita qualquer `--apply` enquanto o
relatório conectado não tiver `complete=true` e zero blockers.

Para uma versão mais rápida de inspeção (sem coleta de detalhes de quarentena por execução e sem
carregar todo estado de destino para `createRuntimeOptions`), use:

```sh
pnpm migration:v4:dry-run --fast
MIGRATION_FAST_MODE=1 pnpm migration:v4:dry-run
```

O modo rápido é ideal para conferir se o mapeamento está encaixado e gerar um plano sem bloqueio.
Ele mantém os mesmos controles do fluxo de execução do dry-run, mas não deve ser usado para
substituir a execução conectada completa e nem para assumir `complete=true` sozinho.

Uma execução mutável futura exige simultaneamente:

- `--apply`;
- `--tenant e8048d1c-0830-45d7-84de-68e20abd685b` exatamente;
- `--dry-run-report <path>` apontando para o schema exato V4, com tenant Castelo, digests atuais,
  inventário 312/1.374.880/103/133, zero blockers, `complete=true` e
  `writesPerformed=false`;
- `--snapshot-manifest <path>` apontando para o schema exato V4, com `restorable=true`, mesma
  identidade de banco e timestamp anterior ao dry-run dentro da janela de 24 horas;
- `MIGRATION_DATABASE_URL` configurada no ambiente.

Somente após nova autorização explícita, a forma do comando será:

```sh
MIGRATION_DATABASE_URL='<url>' node docs/migration/v4/scripts/migrate.mjs --apply --tenant e8048d1c-0830-45d7-84de-68e20abd685b --dry-run-report <path> --snapshot-manifest <path>
```

O runner abre uma única transação para cleanup, carga e reconciliação. O cleanup percorre a ordem
topológica reversa e a carga percorre a ordem direta. Inserts e valores derivados removem as
identidades determinísticas da carga legada anterior no tenant Castelo, inclusive quando a linha
agora termina como `not_emitted`; merges resetam somente as colunas declaradas como pertencentes ao
legado; aggregates substituem somente a coluna declarada depois de confirmar exatamente um pai;
lookups não limpam nem escrevem. Inserts usam lotes de no máximo 500, e updates de merge/aggregate
devem afetar exatamente uma linha. A reconciliação consulta as identidades persistidas, FKs
obrigatórias, cardinalidade dos payloads aggregate e isolamento do tenant. Qualquer divergência
executa `ROLLBACK`; somente a reconciliação exata permite `COMMIT`.

Identificadores SQL vêm exclusivamente do catálogo Prisma e do mapping validado. Todos os dados,
incluindo organização e identidades, são parâmetros. Não execute `--apply` enquanto
`complete=false`, sem snapshot restaurável ou sem nova autorização explícita.

## Política de segurança e próxima etapa

Os artefatos contêm somente metadados, hashes, contagens e decisões sanitizadas. Não contêm dumps,
linhas, payloads, valores pessoais, credenciais, URLs de conexão ou conteúdo criptográfico. Arquivos
`.env` são locais e proibidos no pacote.

O fluxo transacional está implementado, mas não autorizado. As 209 origens pending permanecem fora
do escopo confirmado. Antes da primeira escrita ainda são necessários: executar novamente o
dry-run conectado, tratar ou remover todas as quarentenas, obter `complete=true` com zero blockers,
criar um snapshot restaurável fresco e receber nova autorização explícita. A presença do comando
`--apply` não concede essa autorização.
