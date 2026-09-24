# Inventário de TI a partir dos termos (#1380)

## Escopo e estado

Reparo **manual**, fora de `prisma/migrations/`. Foi preparado e testado localmente, mas
não foi aplicado em produção.

O inventário migrado tem só um ativo de teste, enquanto os termos de responsabilidade citam
vários (N04CASTELO, MS27CASTELO…). A fonte legada do inventário não está disponível, e o dono
decidiu (24/09/2026) criar os itens a partir dos termos.

O arquivo [backfill-ti-inventory-from-terms.sql](../../infra/prisma/repairs/backfill-ti-inventory-from-terms.sql):

- Lê `tecnologia.terms.asset_code` e separa códigos por vírgula ou ponto e vírgula. A barra
  não separa, porque pode fazer parte do código. A comparação ignora caixa e espaços, e o item
  guarda a grafia do termo.
- Para cada código sem item no inventário, cria um item na categoria **"Migrado dos termos"**
  (criada por organização se faltar). Usuário e entrega vêm do termo **assinado** mais recente
  daquele código, ou do mais recente quando nenhum foi assinado. Usuário ausente ou inativo
  deixa o item sem atribuição e sem data de entrega. Equipamento, marca e id do termo vão para
  as notas.
- `reason` é texto livre: uma devolução não é detectável. O relatório mostra motivo e assinatura
  de cada termo usado, para a TI conferir.
- Não preenche local, data de devolução nem responsável de TI. O termo não tem esses dados.
- Não altera item que já existe nem os termos. O vínculo termo↔ativo é pelo `asset_code`. A
  tela de termos passou a separar os códigos (`app/src/modules/ti/utils/termAssetCodes.ts`) para
  o filtro por ativo achar termos que citam vários.
- Termo com mais de um código atribui todos ao mesmo usuário.
- O apply trava escritas no inventário e nas categorias (`lock_timeout = 5s`). É idempotente, e o relatório
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
Postgres descartável em Docker e cobre dry-run, códigos múltiplos, termo assinado antes do pendente,
usuário inativo, item já existente com outra caixa e idempotência. Sem Docker, o teste é pulado.
