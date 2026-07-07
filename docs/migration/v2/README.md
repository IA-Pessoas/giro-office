# Pacote migracao v2 - legado Castelo

Gerado em: 2026-07-07T12:34:41.416Z
Tenant destino: castelo-contabilidade (e8048d1c-0830-45d7-84de-68e20abd685b)

## Escopo
- Dados locais MariaDB tratados como reais.
- Backup MariaDB local: `/home/bruno-e-andreia/Documentos/06.07.2026`.
- Dados atuais do Supabase tratados como teste.
- Nenhuma escrita foi feita no Supabase.
- Todos os registros com tabela destino confirmada recebem o mesmo organization_id da Castelo.
- Pendencia nao significa dado errado; significa apenas tabela destino ainda nao confirmada.

## Arquivos de carga
- departments: 48
- users: 298
- clients: 2622
- projects: 2299
- taskModels: 416
- taskModels express legados: 384
- taskModels avulsos por departamento: 32
- projectPlans: 6
- projectPlanTasks: 47
- tasks: 24799

## Transformacoes aplicadas
- total: 26498
- tasks: 26399
- clients: 98
- projects: 1

## Pendencias sem tabela destino confirmada
- tabelas: 296

## Validacao referencial
- projectsClient: 0
- tasksClient: 0
- tasksProject: 0
- tasksDepartment: 0
- tasksModel: 0
- tasksResponsible: 0
- taskModelsDepartment: 0
- taskModelsResponsible: 0
- projectPlanTasksPlan: 0
- projectPlanTasksModel: 0
- orgBad: 0

## Caminhos
- Manifesto: /tmp/giro-office-migration-v2/manifest.json
- Carga JSON: /tmp/giro-office-migration-v2/load
- Transformacoes JSON/CSV: /tmp/giro-office-migration-v2/transformations
- Pendencias de mapeamento: /tmp/giro-office-migration-v2/pending-mapping
- Mapas legado->novo: /tmp/giro-office-migration-v2/maps
- Modelos avulsos criados: /tmp/giro-office-migration-v2/task-legacy-ad-hoc-models.csv

## Reconstrucao local
- Comando: `node scripts/migration-v2-rebuild-package.mjs`
- Entrada padrao: `/home/bruno-e-andreia/Documentos/06.07.2026`
- Saida padrao: `/tmp/giro-office-migration-v2`
- Modo atual: staging cru das tabelas com destino confirmado; nao aplica transformacoes finais e nao escreve no Supabase.
- A saida contem dados reais e sensiveis, incluindo senhas legadas; nao versionar arquivos gerados em `/tmp/giro-office-migration-v2`.
- Ultima validacao local: 16 tabelas confirmadas, 35004 linhas fonte, 0 erros de parsing.

## Carga transformada local
- Comando: `node scripts/migration-v2-build-load.mjs`
- Saida padrao: `/tmp/giro-office-migration-v2/load`
- Modo atual: gera JSONs finais, mapas legado->novo e `manifest.json`; nao escreve no Supabase.
- Validacao local atual: `validation.all = 0` e `orgBad = 0`.
- Contagens atuais:
  - departments: 48
  - users: 298
  - clients: 3606
  - projects: 2299
  - taskModels: 416
  - projectPlans: 6
  - projectPlanTasks: 47
  - tasks: 24799
  - regularize.license: 338
  - regularize.process: 1330, incluindo processos tecnicos para orientacoes sem processo legado valido
  - regularize.proceduralGuidances: 432
  - clients.pf: 343
  - regularize.partners: 521
  - regularize.municipalTaxes: 8
  - regularize.passowordsSites: 17
  - regularize.passwordsRegularize: 5665
- Regra aplicada: CPF/CNPJ e migrado como campo de dados, nao como chave de identidade.
- Regra aplicada: cada linha distinta de cliente no banco legado e migrada como registro distinto no banco novo.
- `tb_regularize.clientes.cliente_id` e preservado como rastreabilidade/vinculo legado, mas nao elimina a linha propria de `tb_regularize.clientes`.

## Backup Supabase antes da escrita real
- Backup JSONL read-only criado em `/tmp/giro-office-supabase-backups/supabase-before-real-migration-20260707T182229Z`.
- `pg_dump` local nao foi usado porque a versao local era 16.14 e o Supabase estava em Postgres 17.6.
- Nenhuma escrita foi feita no Supabase durante essa preparacao.

## Aplicacao parcial - Fase 1
- Aplicada em: 2026-07-07T20:09:27Z.
- Script: `node scripts/migration-v2-phase1-load.mjs apply`.
- SQL executado: `/tmp/giro-office-migration-v2/phase1/apply-phase1.sql`.
- Escopo carregado:
  - departments: 48
  - users: 298
  - clients: 3606
  - clients.pf: 343
  - integracao.tasksModel: 416
  - integracao.projectPlan: 6
  - integracao.projectPlanTasks: 47
  - integracao.projects: 2299
- Validacao pos-carga: todas as checagens referenciais da Fase 1 retornaram 0.
- Observacao: a primeira tentativa falhou antes do `COMMIT` por `organizations.updated_at` obrigatorio; a transacao foi revertida e as contagens antigas permaneceram. O SQL foi corrigido para preencher `created_at`/`updated_at` e a segunda execucao concluiu com `COMMIT`.

## Aplicacao parcial - Fase 2
- Aplicada em: 2026-07-07T20:26:32Z.
- Script: `node scripts/migration-v2-phase2-load.mjs apply`.
- SQL executado: `/tmp/giro-office-migration-v2/phase2/apply-phase2.sql`.
- Escopo carregado:
  - integracao.tasks: 24799
  - regularize.license: 338
  - regularize.process: 1330
  - regularize.proceduralGuidances: 432
  - regularize.partners: 521
  - regularize.municipalTaxes: 8
  - regularize.passowordsSites: 17
  - regularize.passwordsRegularize: 5665
- Validacao pos-carga: todas as checagens referenciais da Fase 2 retornaram 0.
