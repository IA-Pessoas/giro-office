# E2E roda em homologação; em produção só com prefixo QA_ e limpeza versionada

Política definida em #1383 (épico #1373), depois do E2E de 23/09/2026, que deixou dados de teste
misturados aos dados reais da organização.

## Considered Options

- **Testar em produção com nomes livres**: foi o que aconteceu. Os registros "teste" não se
  distinguem de dado real, e a limpeza exige caça manual.
- **Proibir qualquer teste em produção**: impede validar integrações que só existem com dado real.
- **Homologação por padrão, produção só com prefixo `QA_` e limpeza versionada** (escolhido).

## Regra

1. **E2E roda em homologação, com dados sintéticos.** O ambiente sai do seed de QA:
   `pnpm --filter @workspace/infra prisma:seed:qa` (e `prisma:seed:qa:wizard` para projetos),
   num banco descartável. O passo a passo do banco e dos serviços está em
   [docs/qa/wizard-projetos-qa.md](../qa/wizard-projetos-qa.md#como-rodar-a-evidência-end-to-end). As organizações e usuários
   sintéticos estão em `scripts/qa/integracao-fixtures.mjs`.
2. **Em produção, só com autorização explícita do dono**, quando o comportamento depende de
   dado ou integração real. Nesse caso:
   - todo registro criado tem nome com prefixo `QA_` (cliente, tarefa, projeto, item, categoria);
   - quem testa anota os IDs criados durante a rodada;
   - antes de terminar, versiona um script de limpeza em `scripts/qa/cleanup-e2e-prod-<data>.sql`
     no formato de [cleanup-e2e-prod-2026-09-23.sql](../../scripts/qa/cleanup-e2e-prod-2026-09-23.sql):
     IDs explícitos, guardas que exigem o prefixo `QA_`, dry-run por padrão e `-v apply=1` para
     aplicar, tudo numa transação;
   - roda o dry-run, aplica e registra o resultado no relatório da rodada.
3. **Nunca** usar nomes genéricos ("teste", "Teste", "TESTE") em produção. Eles não se distinguem
   de dado real e não entram nas guardas.
4. Logs de auditoria (`logs`, `audit_requests`) não são apagados pela limpeza.

## Limpeza pendente de 23/09/2026

| Script | O que remove |
| --- | --- |
| `scripts/qa/cleanup-e2e-prod-2026-09-23.sql` | Registros `QA_` da rodada de 23/09. Com `-v residue=1`, também os clientes "QA E2E CLIENT PF/PJ 20260922" |
| `scripts/qa/cleanup-legacy-test-data.sql` | Chamados de TI "teste"/"teste 00001", ativo "teste" e termo "testecodigo" |

Ordem: dry-run dos dois, conferência dos alvos, apply do primeiro (com `residue=1`) e depois do
segundo. A última consulta do segundo script, "registros de teste restantes", precisa dar `0`.
