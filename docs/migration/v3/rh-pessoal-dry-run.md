# Migração RH e Departamento Pessoal - Dry-run v3

Data do dry-run final: 2026-07-14T21:46:31.975Z

## Objetivo

Registrar a análise de migração dos dados de RH e Departamento Pessoal do legado para o
banco atual no Supabase, sem aplicar alterações no banco.

Este documento consolida a regra revisada de migração: o backup legado é a fonte da verdade
e todos os registros devem ser migrados ou enviados para quarentena rastreável.

## Fontes

- Backup legado: `/home/bruno/Documents/06.07.2026`
- Artefatos do dry-run: `/tmp/giro-office-rh-pessoal-v3-dry-run`
- Banco novo analisado: Supabase PostgreSQL
- Tenant alvo atual: `e8048d1c-0830-45d7-84de-68e20abd685b`

Nenhuma escrita foi feita no Supabase durante esta análise.

## Regras v3

- A chave de migração deve ser `schema.tabela + id legado`.
- `nome`, `cpf`, `email`, `rg` e campos similares nao podem ser usados como chave de
  identidade.
- `nome`, `cpf`, `email` e `rg` podem ser migrados apenas como dados.
- Todo registro do backup legado deve ter um dos dois destinos:
  - carga preparada para uma tabela equivalente no sistema novo;
  - quarentena com motivo objetivo.
- Se existe tabela equivalente no sistema novo e ela possui campos adicionais, o registro pode
  ser preparado com `null`, defaults ou valores derivados validos.
- Se nao existe tabela equivalente confirmada no sistema novo, o registro deve ir para
  quarentena.
- Senhas ou segredos do legado nao devem ser gravados em claro nos artefatos. No dry-run, foram
  mascarados como `<redacted:requiresEncryption>`.

## Regra corrigida para solicitacoes RH

O campo legado `tb_rh.solicitacoes.requerente` representa
`tb_rh.colaboradores.id`, nao `tb_admin.usuarios.id`.

Por isso, ao preparar `rh.requests`, o solicitante deve ser resolvido pelo mapa de
colaboradores:

```js
const requesterId = maps.collaboratorByLegacy.get(String(row.requerente));
```

Essa regra alimenta `rh.requests.requester_user_id`.

O campo legado `tb_rh.solicitacoes.atribuido` continua representando usuario administrativo,
entao `rh.requests.assigned_to_user_id` deve continuar usando o mapa de usuarios:

```js
const assignedToId = maps.adminUserByLegacy.get(String(row.atribuido));
```

Anti-regressao: nao resolver `row.requerente` diretamente pelo mapa de usuarios administrativos.
Isso troca o solicitante quando o ID do colaborador coincide com outro `tb_admin.usuarios.id`.
Exemplo validado em 2026-07-20: `rh.requests` id
`08802a97-27fd-5f8b-b1b2-11a54e7cf2ce` vem da solicitacao legada `174`; `requerente = 145`
deve resolver para a colaboradora Hosana Jennifer Souza Palmeira, nao para a usuaria
administrativa Islaine Souza.

## Resultado do dry-run

Registros lidos no legado:

| Origem | Registros |
| --- | ---: |
| `tb_admin.usuarios` | 297 |
| `tb_admin.departamentos` | 47 |
| `tb_admin.permissoes_rh` | 234 |
| `tb_admin.permissoes_pessoal` | 32 |
| `tb_integracao.clientes` | 2296 |
| `tb_rh.colaboradores` | 286 |
| `tb_rh.alergias` | 24 |
| `tb_rh.contatos_emergencia` | 185 |
| `tb_rh.pontos` | 36 |
| `tb_rh.pontos_registros` | 2150 |
| `tb_rh.pontos_solicitacoes` | 134 |
| `tb_rh.score` | 154 |
| `tb_rh.score_avaliacoes` | 1158 |
| `tb_rh.score_nitro` | 48 |
| `tb_rh.score_perguntas` | 26 |
| `tb_rh.solicitacoes` | 905 |
| `tb_rh.solicitacoes_categorias` | 7 |
| `tb_rh.solicitacoes_mensagens` | 1813 |
| `tb_pessoal.folhas` | 182 |
| `tb_pessoal.ldd` | 958 |
| `tb_pessoal.obrigacoes` | 1545 |
| `tb_pessoal.sindicato` | 22 |
| `tb_pessoal.bem` | 95 |
| `tb_pessoal.bsf` | 45 |
| `tb_pessoal.codigos_acesso` | 15 |
| `tb_pessoal.contri_assis` | 10 |
| `tb_pessoal.empregador_web` | 156 |

Registros preparados para carga:

| Destino | Registros |
| --- | ---: |
| `departments` | 47 |
| `clients` | 2296 |
| `users` | 347 |
| `permissions` | 265 |
| `pessoal.union` | 22 |
| `pessoal.payroll` | 175 |
| `pessoal.ldd` | 914 |
| `pessoal.obligations` | 1493 |
| `pessoal.situations` | 28 |
| `pessoal.passwords` | 307 |
| `rh.pointConfig` | 14 |
| `rh.points` | 2104 |
| `rh.timeSheets` | 80 |
| `rh.timeBankReleases` | 2 |
| `rh.timeClockRequest` | 134 |
| `rh.holidays` | 0 |
| `rh.score_questions` | 26 |
| `rh.score` | 154 |
| `rh.score_nitro` | 48 |
| `rh.score_evaluations` | 1158 |
| `rh.request_categories` | 7 |
| `rh.requests` | 238 |
| `rh.request_messages` | 591 |

## Quarentena

Total em quarentena: 3274 registros.

Quarentena por tabela:

| Origem | Registros |
| --- | ---: |
| `tb_rh.contatos_emergencia` | 20 |
| `tb_admin.permissoes_rh` | 1 |
| `tb_pessoal.folhas` | 7 |
| `tb_pessoal.ldd` | 44 |
| `tb_pessoal.obrigacoes` | 52 |
| `tb_pessoal.bem` | 4 |
| `tb_pessoal.bsf` | 2 |
| `tb_pessoal.codigos_acesso` | 2 |
| `tb_pessoal.empregador_web` | 6 |
| `tb_rh.pontos` | 22 |
| `tb_rh.pontos_registros` | 46 |
| `tb_rh.solicitacoes` | 667 |
| `tb_rh.solicitacoes_mensagens` | 1222 |
| `tb_rh.andares` | 53 |
| `tb_rh.cce` | 417 |
| `tb_rh.cce_avaliacoes` | 635 |
| `tb_rh.colaboradores_atas` | 19 |
| `tb_rh.feedbacks` | 13 |
| `tb_rh.ferias_periodos` | 23 |
| `tb_rh.intercorrencias` | 6 |
| `tb_rh.intercorrencias_tipos` | 8 |
| `tb_rh.provas` | 1 |
| `tb_rh.pv` | 2 |
| `tb_rh.pv_objetivos` | 2 |

Principais motivos:

| Motivo | Registros |
| --- | ---: |
| Sem tabela destino equivalente confirmada no sistema novo | 1179 |
| Solicitacao sem mapa legado | 1221 |
| Atribuido sem mapa legado | 641 |
| Cliente, empresa ou cliente_id sem mapa legado | 117 |
| Entrada obrigatoria ausente | 46 |
| Horario obrigatorio ausente | 22 |
| Colaborador_id sem mapa legado | 20 |
| Requerente sem mapa legado | 26 |
| User_id sem mapa legado | 1 |
| Remetente sem mapa legado | 1 |

## Preflight anti-duplicidade

O dry-run foi regenerado em 2026-07-14T21:56:23.442Z com o relatorio adicional
`reports/preflight-anti-duplication.json`.

Resultado: `safeForFirstWrite = false`.

O tenant atual possui registros equivalentes por campos naturais, mas com IDs diferentes da
regra v3. Estes campos nao sao chave de migracao, mas sao sinais fortes de carga anterior e
bloqueiam qualquer escrita automatica para evitar duplicacao da primeira migracao.

Resumo do tenant atual:

| Tabela | Registros atuais |
| --- | ---: |
| `users` | 301 |
| `clients` | 3622 |
| `departments` | 49 |

Conflitos naturais encontrados:

| Entidade | Campo | Conflitos |
| --- | --- | ---: |
| `users` | `login` | 296 |
| `users` | `cpf` | 50 |
| `users` | `rg` | 100 |
| `users` | `email` | 101 |
| `clients` | `cpf_cnpj` | 2224 |
| `clients` | `name` | 2296 |
| `clients` | `email` | 1385 |
| `departments` | `name` | 47 |

Conflitos por ID v3 continuam zerados em todas as tabelas preparadas. Isso confirma o risco:
para o banco, a carga v3 pareceria nova, mas para o negocio ela se sobrepoe a dados ja
migrados por outra estrategia.

Conclusao: nao gravar no tenant atual sem antes limpar/recriar o tenant ou criar uma etapa
formal de reconciliacao que substitua os IDs atuais pelos IDs v3 sem duplicar registros.

## Prontidao de aplicacao

Status: nao aplicar diretamente ainda.

Bloqueios atuais:

1. O tenant atual possui carga anterior/parcial com IDs diferentes da regra v3. O preflight
   classifica isso como bloqueio critico `previous-load-natural-conflicts`.
2. Mesmo em tenant limpo, `rh.requests` ainda possui bloqueio funcional: o legado permite
   solicitacoes sem atribuido, mas o schema novo exige `assigned_to_user_id`. Por isso, 667
   solicitacoes e parte das mensagens ficam em quarentena.

Nao ha pendencias de referencia para `client_id` nas cargas preparadas de Departamento Pessoal
apos incluir `clients` e `departments` no pacote v3.

## Decisao tecnica recomendada

Antes da migracao completa de RH e Departamento Pessoal, resolver explicitamente a regra de
`rh.requests.assigned_to_user_id`.

Opcao recomendada: permitir `assigned_to_user_id` nulo para representar chamados legados ainda
nao assumidos. Isso preserva o fato historico do legado sem inventar usuario responsavel.

Opcao alternativa: manter essas solicitacoes em quarentena ate existir uma regra de negocio
formal para atribui-las. Essa opcao preserva integridade do schema atual, mas deixa parte
relevante do historico de RH fora do sistema novo.

Nao e recomendado criar usuario artificial, usar nome/CPF/email como chave, nem atribuir todos
os chamados a um responsavel padrao sem aprovacao de negocio.

## Proximo passo prudente

1. Decidir o tratamento da carga anterior no tenant atual: limpar/recriar o tenant ou executar
   reconciliacao controlada de IDs. Sem essa decisao, nao deve haver escrita.
2. Validar a decisao sobre `rh.requests.assigned_to_user_id`.
3. Se a decisao for permitir nulo, criar migration de schema e testes do `rh-service` para
   chamados sem atribuido.
4. Regenerar o dry-run v3 e conferir se a quarentena cai para registros sem tabela destino ou
   referencias realmente ausentes.
5. So depois disso executar a migracao real, com logs de carga, validacao de contagem e relatorio
   final de reconciliacao.

