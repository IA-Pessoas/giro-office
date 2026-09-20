# Compatibilidade e proposta de acesso das migrations — 13/09/2026

Continuação autorizada do [plano de migração](../../superpowers/plans/2026-09-13-migracao-legado-clientes-schema.md). A FK comercial já está corrigida no arquivo local. Esta etapa acrescentou consultas somente leitura, testes locais e uma proposta de patch; nenhum novo patch foi aplicado às migrations, nenhum DDL foi executado no destino e Docker não foi atualizado.

## Constatações novas

| Verificação | Resultado e consequência |
| --- | --- |
| `proposal.config` | Zero linhas na consulta global. Não há valor existente a converter nesse retrato; isso não libera o rename sem verificar os consumidores. |
| Responsável de tarefas | Zero linhas com `responsible_id` nulo. Relaxar a coluna não muda esses dados, mas cargas futuras sem responsável exigem compatibilidade própria. |
| Conexões em execução | Clientes, tarefas, projetos e relatórios usam conexão correspondente ao papel `postgres` no Supabase do mapeamento. Valores de conexão não foram exibidos. |
| Papel no banco | `postgres` tem `BYPASSRLS`; `anon` e `authenticated` não têm. RLS não substitui a validação de organização nos serviços que usam `postgres`. |
| Proprietário e grants | As tabelas inspecionadas pertencem a `postgres`. Há grants padrão para `anon`/`authenticated` em tabelas novas de `public`. |
| Código funcional em execução | Nos seis processos inspecionados, foram examinados 311 arquivos JavaScript fora do código gerado, sem referência literal a `proposalConfig`, `proposal.config`, `minimum_wage` ou `contract_value`. A busca não cobre todos os possíveis consumidores externos ou consultas construídas dinamicamente. |
| Prisma gerado em execução | A inspeção anterior encontrou `minimum_wage` e não `contract_value`. As imagens consultadas não identificam a revisão Git no label analisado. |
| Estatísticas de consultas | Foram encontrados padrões contendo a tabela e a coluna antiga. As estatísticas podem incluir inspeções, comandos administrativos e histórico anterior; não identificam, sozinhas, uma rota atualmente ativa. Nenhum texto de consulta com dados foi exportado. |
| Serviço comercial | Não existe container comercial entre os serviços de produção listados. No checkout local faltam dependências e Prisma gerado desse serviço, impedindo seus testes. |

A configuração `pgrst.db_schemas` não apareceu nas configurações de papéis/bancos consultadas. Isso não demonstra que a Data API esteja desativada: a configuração efetiva pode vir de outra origem. Não foram feitas chamadas REST para obter dados nem alteradas configurações do projeto.

## Acesso usado pelo código atual

O frontend de Comercial e Relatórios chama as APIs dos serviços. Os serviços usam Prisma com `PrismaPg` e conexão PostgreSQL. Nos fluxos examinados, a organização é obtida/conferida pelo serviço, inclusive em referências e operações de idempotência. Não foi encontrada dependência de acesso direto de `anon`/`authenticated` às nove tabelas novas.

| Tabela nova | Consumidor localizado |
| --- | --- |
| `integracao.project_wizard_confirmations` | `services/task-service/src/services/projectWizardService.ts` |
| `reports.snapshot_blocks` | `services/reports-service/src/services/reportSnapshotService.ts` e `reportLifecycleService.ts` |
| `commercial.prospecting` | `services/commercial-service/src/services/prospectingService.ts` |
| `commercial.outbox_events` | Services de prospecção, cobrança e worker de outbox do Comercial |
| `client.commercial_projection_events` | `services/client-service/src/services/clientCommercialProjectionService.ts` |
| `commercial.task_billing` | `services/commercial-service/src/services/taskBillingService.ts` |
| `integracao.commercial_task_billing_projection_events` | `services/task-service/src/services/commercialTaskBillingProjectionService.ts` |
| `commercial.email_notifications` | `services/commercial-service/src/services/commercialEmailNotificationService.ts` |
| `commercial.prospecting_close_events` | `services/task-service/src/services/commercialProspectingCloseService.ts` |

Isso fundamenta uma proposta de acesso por serviços, sem inventar políticas que associem `auth.uid()` a usuários/organizações do Giro. A validação de organização continua obrigatória nos serviços, porque o papel de conexão verificado contorna RLS. A inferência precisa ser confirmada no ensaio com o papel que será efetivamente usado pelo Comercial.

## Proposta concreta para aprovação

O [patch privado](./preflight/proposta-acesso-nove-tabelas.patch) altera seis migrations pendentes, envolvendo exatamente as nove tabelas acima:

1. Envolve o conteúdo de cada uma das seis migrations em `BEGIN`/`COMMIT`, para que a criação e a proteção propostas pertençam à mesma transação.
2. Habilita RLS nas nove tabelas novas.
3. Revoga todos os privilégios dessas tabelas de `PUBLIC`, `anon` e `authenticated`.
4. Preserva os privilégios de `postgres` e `service_role`. Não cria políticas de acesso direto para os papéis de clientes.

Exemplo do conteúdo preparado, a ser aplicado ao arquivo somente após aprovação:

```sql
ALTER TABLE public."commercial.prospecting" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."commercial.prospecting"
  FROM PUBLIC, anon, authenticated;
```

Não são propostos grants/RLS novos para tabelas existentes, alterações de privilégios padrão globais, desativação da Data API ou alterações de Docker. O patch preserva a correção já aprovada de `organizations`. Os arquivos originais mantêm sua estrutura e regras; o patch acrescenta somente as transações e as instruções de proteção.

O uso de grants junto com RLS segue a [documentação de segurança da API](https://supabase.com/docs/guides/api/securing-your-api). A proposta mantém as novas tabelas sem acesso direto pelos papéis de clientes; a [documentação de RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) descreve a interação entre privilégios e políticas. As políticas atuais das demais tabelas não foram auditadas integralmente nesta etapa.

`git apply --check` passou para os seis arquivos. A verificação estrutural conferiu a lista exata das nove tabelas, as nove instruções de RLS, as nove revogações e a preservação da FK corrigida. Isso é validação do patch, não aplicação de SQL nem prova de comportamento no PostgreSQL.

### Condições do futuro ensaio

- Renovar o histórico e confirmar ausência das nove tabelas antes de executar. Uma tabela que já exista exige reconciliação de definição, dados e grants; `IF NOT EXISTS` não autoriza aplicar a política sobre um objeto inesperado.
- Conferir o `search_path`/schema efetivo do executor e aplicar com o mecanismo de migrations aprovado; os nomes com ponto são tabelas literais em `public`.
- Ensaiar as seis migrations com transação explícita no executor real e testar rollback de uma falha intermediária, sem supor atomicidade do conjunto das dez migrations.
- Para cada nova tabela, testar negação de SELECT/INSERT/UPDATE/DELETE a `anon` e `authenticated`, além da ausência dos demais privilégios revogados; testar acesso pelo papel efetivo do serviço.
- Testar os fluxos autorizados de cada organização e a rejeição de referências cruzadas pelas APIs dos serviços. RLS com conexão privilegiada não demonstra esse isolamento.
- Confirmar que tabelas existentes mantêm dados e permissões e que nenhum worker/evento operacional foi disparado.
- Preparar backup consistente e restauração verificada antes do DDL no destino, conforme o ponto de aprovação já definido no plano.

O patch não deve ser aplicado ao banco isoladamente depois de uma criação já exposta. A proposta insere a proteção na própria transação de criação; sua integração ao executor precisa ser testada.

## Testes executados e limite encontrado

| Escopo | Resultado |
| --- | --- |
| Tarefas: unicidade ativa, responsável opcional e wizard | 26 testes aprovados em três arquivos |
| Relatórios: leitura de snapshots | 9 testes aprovados em um arquivo |
| Comercial: propostas, cobrança, outbox e notificações | Não iniciaram: `vitest` não disponível no pacote; o reaproveitamento do runner já instalado também falhou por resolução da dependência |

No Comercial também estão ausentes o vínculo local de `@workspace/shared`, dependências do adaptador/Zod e `src/generated/prisma/client.ts`. Não foram instalados pacotes, alterado lockfile, gerado Prisma ou atualizado Docker nesta etapa. A preparação desse ambiente local é uma pendência anterior ao ensaio funcional do Comercial.

Os 35 testes aprovados usam dependências de teste e não aplicam migrations. Os 43 testes puros aprovados na etapa anterior continuam sendo evidência daquela execução, sem serem contados novamente como testes novos desta etapa.

## Carga histórica e efeitos operacionais

O fluxo comercial normal produz eventos. `clientCommercialProjectionService.ts`, por exemplo, usa `updateMany` para mudar status, situação de prospecção, data e descrição de um cliente existente ao aplicar um evento.

Portanto, criar registros comerciais por esse fluxo pode violar a regra aprovada de preservar os dados existentes, mesmo que a primeira operação seja um INSERT. A preparação dos lotes deve manter a proibição de disparar outbox, e-mails, fechamentos e atualizações de projeções. Não executar a migração histórica por esses services sem um procedimento específico revisado para evitar os efeitos operacionais.

## Estado para decisão

- A correção local da FK comercial está concluída e validada.
- O novo patch de acesso/transações está preparado, validado estruturalmente e **não aprovado nem aplicado**.
- O rename de propostas continua pendente de compatibilidade e ensaio; tabela vazia e busca estática não bastam para liberá-lo.
- As dez migrations permanecem sem execução por esta sessão. Nenhum dado foi carregado.
- Após aprovação da política, aplicar apenas o patch local; instalação de dependências, ambiente de ensaio e execução de DDL devem respeitar seus escopos de autorização próprios.

Evidências privadas: [diagnóstico de compatibilidade/acesso](./preflight/compatibilidade-acesso-2026-09-13.json) e [manifesto do patch](./preflight/proposta-acesso-nove-tabelas.json), com arquivos em modo `0600`, diretório em modo `0700` e exclusão do Git conferida.
