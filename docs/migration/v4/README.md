# Migração V4 — Castelo Contabilidade

Este diretório contém o mapeamento semântico auditável do backup `03.08.2026` do sistema legado
para os contratos já existentes do Giro Office. O pacote é exclusivamente `dry-run`: não limpa,
não carrega e não altera dados, schema, tabelas ou serviços.

## Identidade e estado do pacote

- Organização: Castelo Contabilidade (`e8048d1c-0830-45d7-84de-68e20abd685b`).
- Namespace: `castelo-contabilidade`.
- Origem: 312 dumps, 1.374.880 linhas inventariadas.
- Estados finais: 102 origens `confirmed` e 210 `pending`.
- Passos de destino: 132, sendo 90 `insert`, 22 `merge`, 14 `derived`, 4 `lookup` e 2
  `aggregate`.
- Digest da origem: `e76a761406a4cc2e2aa2cae959c51be79c59a968f06a12f0702f3233876cb742`.
- Preflight real: executado em `READ ONLY`, sem escrita, com `readyForMigration=false`.

`readyForMigration=false` é o resultado correto neste estágio. As 210 origens pending e os passos
que ainda exigem classificadores/resoluções de runtime impedem uma migração segura. Nenhuma
pendência é resolvida pela criação de tabela ou serviço: ela permanece registrada em
`pending-mapping/` ou nos blockers do preflight até existir evidência nos contratos atuais.

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

## Resultado do preflight real

O preflight consultou 101 tabelas do schema `public` dentro de uma transação
`BEGIN TRANSACTION READ ONLY`. Todos os cinco requisitos locais de criptografia foram detectados
como configurados, sem registrar valores. O relatório final contém 132 passos bloqueados e 384
blockers agregados:

- `PENDING_MAPPING_EXISTS`: 210;
- `SEMANTIC_EVIDENCE_MISSING`: 136;
- `MERGE_IDENTITY_CONFLICT`: 22;
- `TENANT_SCOPE_UNPROVEN`: 14;
- `DESTINATION_NULLABILITY_MISMATCH`: 1;
- `PRISMA_DATABASE_DRIFT`: 1.

O mapeamento offline registrou 751.727 estados `blockedRows`; não classificou essas linhas como
preparadas nem como quarentena sem executar os contextos obrigatórios. A quarentena materializada
permanece com zero itens não resolvidos. Esses números não autorizam limpeza nem carga.

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

## Política de segurança e próxima etapa

Os artefatos contêm somente metadados, hashes, contagens e decisões sanitizadas. Não contêm dumps,
linhas, payloads, valores pessoais, credenciais, URLs de conexão ou conteúdo criptográfico. Arquivos
`.env` são locais e proibidos no pacote.

Qualquer futura limpeza ou carga exige outro desenho, tratamento explícito das 210 pending e dos
blockers, nova validação e nova autorização imediatamente antes da primeira escrita. Este pacote não
propõe nem implementa esse fluxo.
