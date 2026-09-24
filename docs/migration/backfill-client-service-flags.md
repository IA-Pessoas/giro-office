# Flags de serviço dos clientes (#1376)

## Escopo e estado

Reparo **manual**, fora de `prisma/migrations/`. Foi preparado e testado localmente, mas
não foi aplicado em produção.

A carteira contábil lista só os clientes com `contabil = true`. A migração não trouxe as flags
`contabil`, `fiscal` e `pessoal`. O dump legado não estava acessível, então o dono decidiu
(24/09/2026) usar como evidência os dados do módulo que já foram migrados. O negócio confere
a contagem antes de aplicar.

O arquivo [backfill-client-service-flags.sql](../../infra/prisma/repairs/backfill-client-service-flags.sql)
liga cada flag quando o cliente tem ao menos um registro em:

| Flag | Evidência |
| --- | --- |
| `contabil` | `contabil.control`, `contabil.relationship`, `contabil.responsibles`; triagem (`configs`, `monthly`, `responsibles`) com `type = 'CONTABIL'` |
| `fiscal` | triagem (`configs`, `monthly`, `responsibles`) com `type = 'FISCAL'` |
| `pessoal` | `pessoal.ldd`, `pessoal.obrigations`, `pessoal.situations`, `pessoal.passwords`, `pessoal.payroll` |

- Só liga flag (`NULL`/`false` para `true`); nunca desliga. É idempotente.
- Não olha a data da evidência: um cliente que saiu do serviço mas ainda tem registro antigo
  também é ligado. O relatório mostra o status do cliente e as fontes, para o negócio
  desligar o que não for serviço vigente.
- Tabela de evidência ausente vira `NOTICE` e fica fora.

## Como rodar

1. Autorização para o ambiente alvo e backup com restauração testada.
2. Dry-run, que também é o relatório:

   ```sh
   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-client-service-flags.sql
   ```

   A saída traz as contagens por flag e status, a lista de clientes com a evidência de cada um
   e o total de ativos com cada flag depois do reparo. Confira esse total com o negócio.
3. Com a contagem aprovada:

   ```sh
   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-client-service-flags.sql
   ```

4. Confira a carteira contábil (`GET /api/contabil/controls/list?competence=<AAAA-MM>`).

## Teste

`node --test infra/prisma/scripts/test/backfill-client-service-flags.test.mjs` sobe um Postgres
descartável em Docker e cobre dry-run, apply, filtro por tipo da triagem e idempotência.
Sem Docker, o teste é pulado.
