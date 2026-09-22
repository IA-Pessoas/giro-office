# Certificate-service — paridade do Worker

Data: 2026-09-22

## Comparação de rotas

Além de `GET /health`, as rotas do Node foram comparadas com `workers/certificate-service`:

- notificações: `GET /certificate/notifications` e `POST /internal/notifications/run`;
- PF: listar, detalhar, criar, atualizar, remover e operações de arquivo em `/certificate/pf`;
- PJ: listar, detalhar, criar, atualizar, remover e operações de arquivo em `/certificate/pj`;
- relatório interno: `GET /internal/reporting/catalog` e `POST /internal/reporting/extract`.

As rotas de certificado, arquivo e notificações já estavam presentes. O gap encontrado foi o reporting interno; as duas rotas foram adicionadas ao Worker com o mesmo contrato de grant, tenant, catálogo, campos, paginação, envelope e erros.

## Ciclo TDD e implementação

Os testes RED foram escritos antes da implementação e falharam com `404` nas rotas de reporting. O GREEN passou com grant válido, seleção por organização, paginação, catálogo PF/PJ e rejeição de grant ausente ou inválido.

Commit de código: `f1ec88bb` (`feat(certificate-worker): close internal reporting parity`).

Arquivos de código:

- `workers/certificate-service/prisma/schema.prisma`;
- `workers/certificate-service/src/app.ts`;
- `workers/certificate-service/src/env.ts`;
- `workers/certificate-service/src/reporting.ts`;
- `workers/certificate-service/src/reporting.test.ts`.

A implementação usa Web Crypto, JSON canônico, HMAC, comparação em tempo constante e replay guard persistente em `reports.grant_uses`. O extract aplica `organization_id` do grant; não usa D1, URL hardcoded, credencial inventada ou mock que esconda falha real. Nenhuma migration foi criada.

## Validações

- testes completos: 2 arquivos, 12 testes aprovados;
- check: aprovado;
- `prisma validate`: aprovado;
- `wrangler deploy --dry-run`: aprovado, sem deploy.

O typecheck e o build do Worker ficaram bloqueados por estado pré-existente do Prisma do serviço Node: os tipos gerados de `services/certificate-service` não existem no worktree, e `prisma:generate` exige `DATABASE_URL`. A tentativa foi interrompida sem inventar valor de configuração e sem alterar `services/**`. Os erros apontam imports ausentes de `services/certificate-service/generated/prisma/client.js` nos serviços de notificação, PF e PJ.

Graphify foi tentado antes da edição. Como o primeiro contexto não tinha grafo local, foi usado fallback manual com `rg`; a atualização de Graphify de `services` foi executada ao final.

## Lacunas e risco de staging

O código de arquivos mantém Web Crypto, validação de tamanho/MIME, Storage privado, signed URL e remoção compensatória já existentes; não houve smoke real contra Supabase Storage nem verificação publicada de signed URL nesta rodada. Também não houve smoke autenticado contra PostgreSQL/Supabase real, deploy, push, reset, rebase ou force-push.

O bloqueio de `DATABASE_URL`/Prisma gerado precisa ser resolvido na configuração do ambiente de staging antes de declarar o build integrado verde. Alterações staged de Fiscal/Parcelamento de outra execução foram preservadas e não fazem parte deste commit.
