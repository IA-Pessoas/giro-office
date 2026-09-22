# Relatório — restante de TI no Worker

## Escopo executado

Implementado somente em `workers/ti-service/**`, com este relatório como único
artefato fora do Worker:

- rotas de inventário, categorias e locais de inventário;
- ramais, senhas, chamados, mensagens e categorias de chamados;
- robôs e execuções;
- termos e assinatura;
- dashboard;
- estoque, movimentações, categorias e locais;
- `/internal/reporting/catalog` e `/internal/reporting/extract`.

As rotas foram conferidas contra `services/ti-service/src/app.ts` e seus
routers reais. Os contratos Zod existentes foram reutilizados. A autorização
mantém os níveis Viewer/Requester/Technician/Admin do serviço Node; o escopo
de organização e, no estoque, o departamento Tecnologia são aplicados nas
consultas. A lista de candidatos de transferência preserva também o filtro
de permissão TI do usuário.

O schema Prisma do Worker foi ampliado somente com os modelos e relações TI
necessários, derivados do schema canônico em `infra/prisma/schema.prisma`.
Senhas continuam usando `EncryptionService`/AES-256-GCM e o Worker exige
`MTK_ENCRYPTION_KEY` para operações de senha. Mensagens aceitam JSON e
multipart com JPEG/PNG/WebP, limite de 5 MiB, validação de assinatura,
upload privado no Supabase e URL assinada por 300 segundos.

## TDD e validação

O baseline inicial tinha 3 testes passando. Foram escritos primeiro 4 testes de
comportamento de rotas; a execução RED observada foi 4 falhas por `404` para as
rotas ainda não migradas. Depois da implementação, esses testes passaram. Um
teste adicional de autorização para listagem de chamados também foi escrito,
observado em RED (`403` em vez de `200`) e passou após alinhar a permissão
Viewer ao serviço Node.

Evidências finais locais:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @workspace/ti-worker test` | PASS — 8/8 |
| `pnpm --filter @workspace/ti-worker typecheck` | PASS |
| `pnpm --filter @workspace/ti-worker build` | PASS |
| `pnpm --filter @workspace/ti-worker check` | PASS — Biome |
| `pnpm exec wrangler deploy --dry-run` | PASS — 6504.55 KiB, sem bindings; não publicou |
| `pnpm graphify:update:services` | PASS — grafo de services atualizado |

O `prisma generate` executado pelos scripts também passou. O `git diff
--check` passou.

## Limites e lacunas honestas

- Não houve deploy real, smoke autenticado contra Postgres/Supabase nem teste
  de URL pública, conforme solicitado.
- O dry-run informa `No bindings found`; a configuração real de Hyperdrive,
  segredos de criptografia, grants de reporting e Supabase Storage continua
  sendo responsabilidade do ambiente de publicação. Nenhuma credencial foi
  inventada.
- A consulta de reporting com `query` foi implementada usando o executor
  compartilhado, com filtros tipados, grupos, ordenação, agrupamento,
  agregações, limite de 50.000 registros/20 MiB e transação de leitura. Não
  foi criado schema ou contrato novo.
- O Worker não foi validado com dados reais; portanto este relatório não
  afirma equivalência funcional de produção.

## Isolamento de mudanças

Não foram alterados `services/ti-service`, gateway, `shared`, app ou outros
Workers. Havia mudanças concorrentes/preexistentes em `app/next-env.d.ts`, em
`workers/pessoal-service/**` e no relatório de User; elas foram preservadas
fora do escopo TI e não fazem parte do estado final do Worker TI.

## Commits

- `adce9ba0 feat(workers): migrate remaining ti routes` — código, testes,
  schema, ambiente e relatório TI.
- `0cedea54 chore: remove concurrent report from ti commit` — correção aditiva
  para retirar do tip a alteração concorrente de User que estava staged antes
  do commit TI.

Não houve deploy nem push.
