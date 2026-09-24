# Inventário de TI a partir dos termos (#1380)

## Escopo e estado

Reparo **manual**, fora de `prisma/migrations/`. Foi preparado e testado localmente, mas
não foi aplicado em produção.

O inventário migrado tem só um ativo de teste, enquanto os termos de responsabilidade citam
vários (N04CASTELO, MS27CASTELO…). A fonte legada do inventário não está disponível, e o dono
decidiu (24/09/2026) criar os itens a partir dos termos.

O arquivo [backfill-ti-inventory-from-terms.sql](../../infra/prisma/repairs/backfill-ti-inventory-from-terms.sql):

- Lê `tecnologia.terms.asset_code` e separa códigos por vírgula, ponto e vírgula ou barra.
  A comparação ignora caixa e espaços; o item é gravado em maiúsculas.
- Para cada código sem item no inventário, cria um item na categoria **"Migrado dos termos"**
  (criada por organização se faltar). O item recebe o usuário e a data do termo mais recente
  daquele código como responsável e entrega. Equipamento, marca e id do termo vão para as notas.
- Não preenche local, data de devolução nem responsável de TI. O termo não tem esses dados.
- Não altera item que já existe nem os termos. O vínculo termo↔ativo é pelo `asset_code`.
- Termo com mais de um código atribui todos ao mesmo usuário.
- O apply trava escritas no inventário (`lock_timeout = 5s`). É idempotente, e o relatório
  final confere que não sobrou código citado sem item.

Depois de aplicar, a TI deve reclassificar os itens da categoria "Migrado dos termos" e
completar local e devoluções.

## Como rodar

1. Autorização para o ambiente alvo e backup com restauração testada.
2. Dry-run, que também é o relatório:

   ```sh
   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-ti-inventory-from-terms.sql
   ```

3. Com a lista conferida pela TI:

   ```sh
   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-ti-inventory-from-terms.sql
   ```

## Teste

`node --test infra/prisma/scripts/test/backfill-ti-inventory-from-terms.test.mjs` sobe um
Postgres descartável em Docker e cobre dry-run, códigos múltiplos, termo mais recente, item já
existente com outra caixa e idempotência. Sem Docker, o teste é pulado.
