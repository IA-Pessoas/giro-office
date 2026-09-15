# Migração do catálogo de grupos de Pessoal

O script `scripts/migrate-pessoal-groups.mjs` transfere a referência canônica
das folhas de `pessoal.payroll.group` para `pessoal.payroll.group_id` sem
alterar o texto legado.

## Pré-requisitos

- As migrations do Prisma, inclusive `pessoal.group_migration_mapping`, foram
  aplicadas no ambiente alvo.
- `DATABASE_URL` e `MIGRATION_ORGANIZATION_ID` apontam para a organização a
  migrar.
- O operador informado existe na organização e possui Pessoal nível 2.

## Dry-run

```bash
MIGRATION_ORGANIZATION_ID=<organizacao> \
DATABASE_URL=<database-url> \
node scripts/migrate-pessoal-groups.mjs
```

O comando não escreve no banco. Ele gera, em `MIGRATION_OUT_DIR` (ou em
`/tmp/giro-office-pessoal-group-migration`), o plano, a quarentena e o
manifesto. Valores vazios, sem grupo, ambíguos, associados a grupo arquivado e
qualquer correspondência automática com `Sem Movimento` ficam em quarentena.

## Resolver a quarentena

Mapeie para um grupo ativo existente:

```bash
MIGRATION_ORGANIZATION_ID=<organizacao> DATABASE_URL=<database-url> \
node scripts/migrate-pessoal-groups.mjs --apply \
  --actor-id=<operador> --map-existing='Grupo legado' --group-id=<grupo>
```

Ou crie um grupo e registre a decisão no mesmo passo:

```bash
MIGRATION_ORGANIZATION_ID=<organizacao> DATABASE_URL=<database-url> \
node scripts/migrate-pessoal-groups.mjs --apply \
  --actor-id=<operador> --create-group='Grupo legado' \
  --create-group-name='Grupo canônico'
```

Cada decisão guarda valor bruto, valor normalizado, grupo escolhido, operador,
data e tipo de resolução em `pessoal.group_migration_mapping`. O comando gera
um novo dry-run após a decisão e só então escreve `group_id` para itens prontos.

## Garantias

- Não há fallback automático para `Sem Movimento`.
- `group_id` só é escrito para correspondência canônica segura ou decisão
  explícita registrada.
- O texto legado em `pessoal.payroll.group` não é apagado nem regravado.
- Ao final, qualquer folha sem `group_id` permanece listada na quarentena;
  qualquer folha pronta que não tenha sido atualizada interrompe a transação.
