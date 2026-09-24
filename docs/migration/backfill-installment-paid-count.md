# Parcelas pagas dos parcelamentos migrados (#1378)

## Escopo e estado

Reparo **manual**, fora de `prisma/migrations/`. Foi preparado e testado localmente, mas
não foi aplicado em produção.

A tela mostra "Pagas" a partir de `paid_installments_count`. A migração copiou esse valor de
`parcelas_pagas` do legado, que veio zerado, enquanto as competências migradas guardam
`how_many_paid` mês a mês. O app já deriva os agregados da soma das competências
(`recalculateAggregates`), mas só quando alguém edita uma competência. O dono decidiu
(24/09/2026) aplicar a mesma regra aos migrados.

O arquivo [backfill-installment-paid-count.sql](../../infra/prisma/repairs/backfill-installment-paid-count.sql)
repete a fórmula de `recalculateAggregates` (serviço e worker de parcelamento):

- pagas = soma de `how_many_paid`; vencidas = max(soma de `how_many_overdue` − pagas, 0);
- restantes = max(acordadas − pagas, 0); saldo = restantes × parcela do mês vigente;
- restantes = 0 → `Liquidado`, com `completion_date` mantida ou agora; um `Liquidado` que
  volta a ter restantes vira `Ativo`.

Limites:

- Só toca parcelamento com pagas = 0 e soma maior que zero. Só usa competências da mesma
  organização. É idempotente.
- Soma acima das acordadas é aplicada como no app, mas vem marcada no relatório
  (`excede? = t`): isso sugere que `how_many_paid` era acumulado naquele parcelamento.
  Confira esses casos antes do apply.
- O apply trava escritas em parcelamentos e competências (`lock_timeout = 5s`).

**Número do acordo:** não foi migrado (`apply-parcelamento-v1-current-tenant.mjs` não mapeia
`agreement_number`), e o dump legado não está disponível. Fica pendente e pode ser preenchido
pela tela do parcelamento.

## Como rodar

1. Autorização para o ambiente alvo e backup com restauração testada.
2. Dry-run, que também é o relatório:

   ```sh
   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-installment-paid-count.sql
   ```

   A saída traz o resumo (excede acordadas, liquida) e o recálculo por parcelamento.
3. Confira uma amostra e os casos que excedem as acordadas com o negócio, depois aplique:

   ```sh
   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-installment-paid-count.sql
   ```

## Teste

`node --test infra/prisma/scripts/test/backfill-installment-paid-count.test.mjs` sobe um
Postgres descartável em Docker e cobre dry-run, recálculo dos agregados, liquidação,
competência de outra organização ignorada e idempotência. Sem Docker, o teste é pulado.
