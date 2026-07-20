# Migracao legado Castelo

Este diretorio concentra a memoria operacional da migracao do sistema legado da
Contabilidade Castelo para o sistema atual.

Tenant alvo:

- Organizacao: Contabilidade Castelo
- `organization_id`: `e8048d1c-0830-45d7-84de-68e20abd685b`
- Foi usado um Backup legado nas analises atuais.

O objetivo deste documento e permitir que outro agente retome a migracao com um
backup mais atualizado sem repetir decisoes ja tomadas.

## Principios adotados

- O legado e a fonte da verdade para os dados historicos.
- Todos os dados do legado pertencem a um unico tenant: Contabilidade Castelo.
- Nao criar novo tenant para esta migracao.
- Os servicos atuais separam dominios que no legado ficavam misturados (monolito).
- A chave tecnica de migracao deve usar `schema.tabela + id legado`.
- Nome, CPF, email, RG e campos similares podem ajudar reconciliacao, mas nao sao
  chave primaria de migracao.
- Todo registro deve terminar em um destes estados:
  - migrado para tabela destino confirmada;
  - mantido em quarentena com motivo e, quando existir, decisao operacional.
- Senhas e segredos nao devem ser documentados em claro.
- Scripts reaproveitaveis de carga ficam versionados em `scripts/`; os artefatos
  gerados por eles em `/tmp` nao devem ser versionados.

## V2

Arquivos principais:

- `v2/README.md`
- `v2/manifest.json`
- `v2/confirmed-table-destinations.csv`
- `v2/pending-mapping/tables-without-confirmed-destination.csv`
- `v2/pending-mapping/tables-without-confirmed-destination.json`
- `v2/transformations/transformations.csv`
- `v2/transformations/transformations.json`
- `v2/task-legacy-ad-hoc-models.csv`

A V2 foi um pacote de analise e preparacao sem escrita no Supabase.

Resumo da V2:

- `departments`: 48
- `users`: 298
- `clients`: 2622
- `projects`: 2299
- `taskModels`: 416
- `projectPlans`: 6
- `projectPlanTasks`: 47
- `tasks`: 24799
- transformacoes aplicadas: 26498
- tabelas sem destino confirmado: 296

Validacao referencial da V2 ficou zerada para os relacionamentos principais de
projetos, tarefas, departamentos, modelos e responsaveis.

## V3

Arquivo principal:

- `v3/rh-pessoal-dry-run.md`

A V3 revisou a regra de migracao para RH e Departamento Pessoal e estabeleceu
que o backup legado deve ser migrado por identificadores legados controlados, sem
usar campos naturais como chave.

Durante a V3 foi identificado que o tenant atual ja tinha dados de cargas
anteriores/parciais com IDs diferentes da regra revisada. A decisao adotada foi
limpar/recriar os dados dos escopos RH e Departamento Pessoal do tenant atual e
reaplicar a carga controlada, em vez de criar outro tenant.

Resultado da carga final de RH/DP:

- `pessoal.union`: 22
- `pessoal.payroll`: 175
- `pessoal.ldd`: 914
- `pessoal.obligations`: 1493
- `pessoal.situations`: 28
- `pessoal.passwords`: 307
- `rh.request_categories`: 7
- `rh.score_questions`: 26
- `rh.pointConfig`: 14
- `rh.points`: 2104
- `rh.timeSheets`: 80
- `rh.timeBankReleases`: 2
- `rh.timeClockRequest`: 134
- `rh.score`: 154
- `rh.score_nitro`: 48
- `rh.score_evaluations`: 1158
- `rh.requests`: 879
- `rh.request_messages`: 1747
- permissoes atualizadas/inseridas: 234

Validacao final de RH/DP:

- quarentena: 0
- orfaos de cliente em `pessoal.passwords`: 0
- orfaos de responsavel em `pessoal.passwords`: 0
- senhas migradas criptografadas com o mecanismo do `pessoal-service`

## Decisoes de RH/DP

- O legado possuia RH e Departamento Pessoal como escopo mais unico; no sistema
  atual eles ficam separados em dois servicos.
- Mesmo assim, todos os dados continuam dentro do mesmo tenant Castelo.
- `assigned_to_user_id` em solicitacoes de RH precisou aceitar nulo para preservar
  solicitacoes legadas sem responsavel assumido.
- Bruno Santana teve divergencia de login porque o login foi alterado diretamente
  no banco. A reconciliacao manteve o usuario atual como Bruno Santana.
- Para 17 registros de senha com cliente duplicado no tenant atual, a regra
  aprovada foi escolher o candidato atual que tivesse `dominio_code` quando
  houvesse exatamente uma opcao com `dominio_code`.
- Se um cliente duplicado tiver mais de uma opcao com `dominio_code`, ou nenhuma,
  nao escolher automaticamente; manter em quarentena para decisao humana.
- Com essa regra, os 17 registros pendentes foram migrados e a quarentena de
  RH/DP foi zerada.

## Tecnologia

A migracao do servico de Tecnologia foi aplicada no tenant Castelo.

Resultado operacional conhecido:

- solicitacoes migradas: 977
- quarentena de Tecnologia: 219

Quarentena de Tecnologia:

- `tb_tecnologia.senhas`: 80
- `tb_tecnologia.reset`: 139

Decisoes de Tecnologia:

- `tb_tecnologia.senhas` sem `password` nao deve ser migrada. O setor de TI
  informou que esses dados nao sao necessarios no novo sistema. Esses registros
  devem permanecer em quarentena com observacao operacional.
- `tb_tecnologia.reset` nao deve ser migrada. O fluxo de reset do sistema novo e
  diferente do fluxo legado. Esses registros devem permanecer em quarentena com
  observacao operacional.
- Solicitacoes de Tecnologia sem solicitante legado passaram a usar o usuario
  tecnico padrao legado `1` como `requester_id`, com observacao no registro
  migrado.

## Certificados

A migracao de Certificados foi aplicada no tenant Castelo a partir do backup
legado de 06/07/2026.

Scripts versionados:

- `scripts/migration-certificates-v1-dry-run.mjs`
- `scripts/apply-certificates-v1-current-tenant.mjs`
- `scripts/migration-certificates-v1-dry-run.test.mjs`

Mapeamento principal:

- `tb_certificados.pj` -> `certificate.pj`
- `tb_certificados.pf` -> `certificate.pf`
- `cliente` -> `client_castelo_status`
- `possui` -> `has_certificate`
- `pagamento` -> `was_paid`
- `validade` -> `expiration_date`
- `data_pagamento` -> `payment_date`, com `0000-00-00` convertido para nulo
- documentos PF/PJ sao normalizados para digitos quando possivel
- campos obrigatorios vazios recebem `NAO INFORMADO`
- `client_focus_status` fica `false`, pois nao existe coluna equivalente no
  legado de certificados

Resultado da carga final de Certificados:

- origem `tb_certificados.pj`: 772 registros
- origem `tb_certificados.pf`: 790 registros
- `certificate.pj`: 762 registros
- `certificate.pf`: 724 registros
- quarentena: 76 registros

Quarentena de Certificados:

- `certificate.pj` com validade invalida: 5
- `certificate.pj` duplicado por identidade unica: 5
- `certificate.pf` com validade invalida: 45
- `certificate.pf` duplicado por identidade unica: 21

Decisoes de Certificados:

- Registros com `validade = '0000-00-00'` ficam em quarentena porque
  `expiration_date` e obrigatorio no schema atual.
- Duplicados por `organization_id + name + documento + model` ficam em
  quarentena para respeitar os indices unicos do schema atual.
- O nome de arquivo legado em `arquivo` nao foi migrado para os metadados de
  storage, porque o novo servico espera arquivo armazenado e metadados
  criptograficos proprios. Os dados cadastrais e a flag `has_certificate` foram
  preservados.

## Parcelamento

Parcelamento foi deixado em segundo plano porque o backend do novo sistema ainda
nao estava completo.

Quarentena atual conhecida de Parcelamento: 49325 registros.

Detalhamento:

- `tb_historico.parcelamento`: 48548
- `tb_cbc.panorama_clientes_parcelamento`: 332
- `tb_cbc.panorama_parcelamentos`: 224
- `tb_parcelamento.competencia`: 117
- `tb_parcelamento.parcelamentos`: 51
- `tb_parcelamento.simulacoes_parcelamentos`: 39
- `tb_parcelamento.simulacoes`: 14

Decisao:

- manter Parcelamento fora do foco principal ate o backend estar pronto;
- preservar a quarentena e reavaliar destinos quando o schema/servico estiver
  completo.

## Panorama de quarentena

Panorama apos a carga final de RH/DP:

- RH/DP: 0
- Certificados: 76
- Tecnologia: 219
- Parcelamento: 49325
- Total geral: 49620

A quarentena restante nao deve ser tratada automaticamente como erro. Parte dela
ja representa decisao operacional documentada:

- Tecnologia sem `password`: nao migrar.
- Tecnologia `reset`: nao migrar.
- Parcelamento: aguardar completude do backend.

## Como repetir com backup mais atualizado

1. Usar o novo dump legado como fonte.
2. Manter o tenant alvo Castelo com o mesmo `organization_id`.
3. Nao criar tenant adicional.
4. Reexecutar os fluxos de carga por dominio, respeitando as decisoes acima.
5. Para RH/DP, reaplicar a regra de reconciliacao por `schema.tabela + id legado`
   e a regra especial de cliente duplicado por `dominio_code` unico.
6. Para Tecnologia, manter `tb_tecnologia.senhas` sem `password` e
   `tb_tecnologia.reset` em quarentena com observacao operacional.
7. Para Certificados, manter `validade = '0000-00-00'` e identidades duplicadas
   em quarentena ate decisao operacional explicita.
8. Para Parcelamento, so retirar da quarentena quando o backend novo tiver destino
   confirmado.
9. Validar contagens finais, orfaos de FK, criptografia de senhas e total de
   quarentena.
10. Atualizar este README com novas contagens, decisoes e diretorios de artefatos
   gerados.

## O que nao versionar

- Dumps do banco legado.
- Arquivos `.env`.
- Chaves de criptografia.
- Senhas ou segredos em claro.
- Diretorios temporarios em `/tmp`.
