# Deduplicação de clientes por CPF/CNPJ (#1374)

## Escopo e estado

Reparo **manual**, fora de `prisma/migrations/`. Foi preparado e testado localmente,
mas não foi aplicado em produção. Ele é pré-requisito da constraint única de
`(organization_id, cpf_cnpj normalizado)`, que precisa usar a mesma normalização do script.

O arquivo [dedupe-clients-by-document.sql](../../infra/prisma/repairs/dedupe-clients-by-document.sql):

- Agrupa clientes por organização e documento só com dígitos. Ficam fora documentos com
  tamanho diferente de 11 ou 14 dígitos e documentos com um único dígito repetido
  (mascarados e placeholders, tratados em #1375).
- Mantém o cliente mais antigo. `clients` não tem `created_at`, então o critério é
  `register_date_prospecting` (default `now()` na criação), com desempate por `id`.
- Move para o mantido todo vínculo com FK para `clients.id`, descoberto em `pg_constraint`,
  e os vínculos sem FK listados no próprio script (`commercial.*`,
  `client.commercial_projection_events`, `pessoal.payroll`,
  `pessoal.group_assignment_preview_details`). Coluna nova com `client_id` sem FK precisa
  entrar nessa lista. FK composta para `clients` faz o script abortar.
- Preenche campos de cadastro vazios (`NULL` ou `''`) do mantido com o primeiro duplicado
  preenchido: contato, endereço, inscrições, CNAE, regime, porte, segmento. Datas de ciclo de
  vida (`deletion_date`, `competence_output`, greve, prospecção) e flags de serviço
  (`contabil`, `fiscal` etc.) **não** são herdadas. A flag contábil é tratada em #1376.
- Remove os duplicados e confere que não sobrou duplicado.
- Roda em transação. O apply trava escritas em `clients` (`lock_timeout = 5s`). O dry-run não
  trava e faz `ROLLBACK`.
- É idempotente: sem duplicados, não altera nada.

Fora do remapeamento:

- **Certificados** (`certificate.pj`/`pf`) se ligam por documento e nome, não por `client_id`.
  O documento é o mesmo; se os nomes do mantido e do removido forem diferentes, confira
  os certificados do removido no relatório.
- Ids de cliente dentro de JSON de histórico e outbox (`payload`, `after_data`) ficam como
  registro do passado.

## Como rodar

1. Autorização para o ambiente alvo e backup com restauração testada.
2. Dry-run, que também é o relatório de duplicados para revisão do negócio:

   ```sh
   psql "$DATABASE_URL" -X -f infra/prisma/repairs/dedupe-clients-by-document.sql
   ```

   A saída traz os pares mantido/removido, os vínculos movidos por tabela e os campos preenchidos.
3. **Conflito de unicidade:** acontece quando mantido e removido têm registro em tabela
   única por cliente ou por competência, como `"clients.pa"`, `pessoal.payroll`, `commercial.prospecting`,
   as configurações e competências da triagem, `contabil.control` e `parcelamento.panorama`.
   O dry-run mostra um `WARNING` e o apply aborta sem gravar. Qual filho fica é decisão do
   negócio. Resolva à mão e rode o dry-run de novo.
4. Com o relatório aprovado e sem conflitos, pare as escritas no app e aplique:

   ```sh
   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/dedupe-clients-by-document.sql
   ```

## Teste

`node --test infra/prisma/scripts/test/dedupe-clients-by-document.test.mjs` sobe um Postgres
descartável em Docker e cobre dry-run, apply, idempotência, campos de estado não herdados e
conflito. Sem Docker, o teste é pulado.
