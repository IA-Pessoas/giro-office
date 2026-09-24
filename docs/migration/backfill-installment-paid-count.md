# Parcelas pagas dos parcelamentos migrados (#1378)

## Escopo e estado

Reparo **manual**, fora de `prisma/migrations/`. Foi preparado e testado localmente, mas
não foi aplicado em produção.

A tela mostra "Pagas" a partir de `paid_installments_count`. A migração copiou esse valor de
`parcelas_pagas` do legado, que veio zerado, enquanto as competências migradas guardam
`how_many_paid` mês a mês. O dono decidiu (24/09/2026): pagas = soma de `how_many_paid`
das competências do parcelamento.

O arquivo [backfill-installment-paid-count.sql](../../infra/prisma/repairs/backfill-installment-paid-count.sql):

- Só atualiza parcelamento com `paid_installments_count = 0` e soma maior que zero.
- Parcelamento cuja soma passa das parcelas acordadas fica de fora e aparece no relatório
  como `grava? = f`. Isso indica que `how_many_paid` ali não é mensal; confira à mão.
- Não mexe em parcelas restantes nem vencidas.
- O apply trava escritas em `"parcelamento.installments"` (`lock_timeout = 5s`). É idempotente.

**Número do acordo:** não foi migrado, e o dump legado (`tb_parcelamento.parcelamentos`) não
está disponível. Fica pendente e pode ser preenchido pela tela do parcelamento.

## Como rodar

1. Autorização para o ambiente alvo e backup com restauração testada.
2. Dry-run, que também é o relatório:

   ```sh
   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-installment-paid-count.sql
   ```

3. Com a amostra conferida com o negócio:

   ```sh
   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-installment-paid-count.sql
   ```

## Teste

`node --test infra/prisma/scripts/test/backfill-installment-paid-count.test.mjs` sobe um
Postgres descartável em Docker e cobre dry-run, apply, o caso que excede as acordadas e
idempotência. Sem Docker, o teste é pulado.
