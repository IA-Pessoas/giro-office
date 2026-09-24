# Deduplicação de clientes por CPF/CNPJ (#1374)

## Escopo e estado

Reparo **manual**, fora de `prisma/migrations/`, preparado e testado localmente.
Não foi aplicado em produção. É pré-requisito da constraint única de
`(organization_id, cpf_cnpj normalizado)`.

O arquivo [dedupe-clients-by-document.sql](../../infra/prisma/repairs/dedupe-clients-by-document.sql):

- Agrupa clientes por organização e documento só com dígitos. Ficam fora documentos com
  tamanho diferente de 11 ou 14 dígitos e documentos com um único dígito repetido
  (mascarados e placeholders, tratados em #1375).
- Mantém o cliente mais antigo (`register_date_prospecting`, desempate por `id`).
- Move para o mantido todo vínculo com FK para `clients.id`, descoberto em `pg_constraint`,
  e os vínculos sem FK listados no próprio script (`commercial.*`, `client.commercial_projection_events`,
  `pessoal.payroll`, `pessoal.group_assignment_preview_details`).
- Preenche campos vazios (`NULL` ou `''`) do mantido com o primeiro duplicado preenchido.
  Campo já preenchido no mantido não muda, inclusive booleanos `false`.
- Remove os duplicados e confere que não sobrou duplicado.
- Roda em transação com `lock_timeout = 5s`. Sem `-v apply=1`, faz `ROLLBACK` (dry-run).
- É idempotente: sem duplicados, não altera nada.

## Como rodar

1. Faça backup do banco.
2. Dry-run, que também é o relatório de duplicados para revisão do negócio:

   ```sh
   psql "$DATABASE_URL" -X -f infra/prisma/repairs/dedupe-clients-by-document.sql
   ```

   Saída: pares mantido/removido, vínculos movidos por tabela e campos preenchidos.
3. **Conflito de unicidade** (ex.: `"clients.pa".client_id`, quando mantido e duplicado têm
   PA): o dry-run lista e o apply aborta sem gravar. Resolva o registro filho à mão
   (escolha qual fica) e rode o dry-run de novo.
4. Com o relatório aprovado e sem conflitos:

   ```sh
   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/dedupe-clients-by-document.sql
   ```

## Teste

`node --test infra/prisma/scripts/test/dedupe-clients-by-document.test.mjs` sobe um Postgres descartável em Docker e cobre
dry-run, apply, idempotência e conflito. Sem Docker, o teste é pulado.
