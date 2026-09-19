# Rollout final do catálogo de grupos de Pessoal

O contrato final de `pessoal.payroll` usa exclusivamente `group_id`. O campo
textual anterior é removido pela migration
`20260916000000_finalize_pessoal_payroll_group_id`; não há escrita dupla nem
fallback em API, frontend ou relatórios.

## Ordem obrigatória

1. Aplique as migrations de catálogo, mapeamento, snapshots de obrigações e bootstrap de
   `Sem Movimento`.
2. Execute o dry-run de `scripts/migrate-pessoal-groups.mjs` para cada
   organização alvo.
3. Resolva toda a quarentena por decisão explícita e repita o dry-run até que
   `unassignedPayrolls` e `quarantinedPayrolls` sejam zero.
4. Aplique a migration final do Prisma. Ela falha sem alterar o schema se
   encontrar folha sem `group_id`, grupo de outra organização, `Sem Movimento`
   com política incorreta ou snapshot de obrigação sem grupo histórico.
5. Execute os testes, typechecks e smoke do Pessoal antes de liberar a versão.

## Dry-run e resolução

```bash
MIGRATION_ORGANIZATION_ID=<organizacao> \
DATABASE_URL=<database-url> \
node scripts/migrate-pessoal-groups.mjs
```

O dry-run não escreve no banco e gera plano, quarentena e manifesto em
`MIGRATION_OUT_DIR` (por padrão,
`/tmp/giro-office-pessoal-group-migration`). Valores vazios, ambíguos,
associados a grupo arquivado ou candidatos a `Sem Movimento` exigem decisão
explícita. O utilitário é somente uma etapa pré-deploy: depois da migration
final, a coluna textual não existe mais.

Mapeie um valor para grupo ativo existente:

```bash
MIGRATION_ORGANIZATION_ID=<organizacao> DATABASE_URL=<database-url> \
node scripts/migrate-pessoal-groups.mjs --apply \
  --actor-id=<operador> --map-existing='Grupo anterior' --group-id=<grupo>
```

Ou registre a criação de um grupo canônico:

```bash
MIGRATION_ORGANIZATION_ID=<organizacao> DATABASE_URL=<database-url> \
node scripts/migrate-pessoal-groups.mjs --apply \
  --actor-id=<operador> --create-group='Grupo anterior' \
  --create-group-name='Grupo canônico'
```

Cada decisão fica auditável em `pessoal.group_migration_mapping` com operador,
data e tipo de resolução. `Sem Movimento` nunca é um fallback automático; seu
bootstrap usa a política `NO_OBLIGATIONS`. Grupos arquivados seguem legíveis
como histórico, e obrigações preservam o snapshot da competência.

## Rastreabilidade do milestone

| Issue | Entrega concluída |
| --- | --- |
| #1081 | Catálogo canônico e referência `group_id` |
| #1082 | Dry-run, quarentena e mapeamento explícito |
| #1083 | Política e snapshot histórico de obrigações |
| #1084 | Atribuição em lote idempotente com prévia |
| #1085 | Relatórios e presets de Pessoal |
| #1086 | Remoção do contrato textual e guarda final de rollout |
