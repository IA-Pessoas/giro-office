# Pacote migracao v2 - legado Castelo

Gerado em: 2026-07-07T12:34:41.416Z
Tenant destino: castelo-contabilidade (e8048d1c-0830-45d7-84de-68e20abd685b)

## Escopo
- Dados locais MariaDB tratados como reais.
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
