# regularize-service

Micro-servico de regularize. Centraliza rotas, validacao, OpenAPI e rotinas internas de reconciliacao do modulo legado. O gateway encaminha as rotas de negocio pelo prefixo publico **`/regularize`**.

As rotas de negocio exigem contexto autenticado e permissao modular `regularize`: nivel `1` permite leitura e nivel `2` permite mutacoes. Chamadas diretas precisam de JWT valido; chamadas do gateway precisam do token interno confiavel e da identidade encaminhada. A leitura preserva aliases de status antigos, mas novas escritas aceitam somente estados canonicos.

## Porta local

Por defeito: **3039** (`PORT`).

## Variaveis de ambiente

Definicao e defaults em [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL` - PostgreSQL (Prisma)
- `DATABASE_POOL_MAX` - teto do pool por processo (default `1`)
- `JWT_SECRET` - validacao do Bearer nas rotas autenticadas
- `PORT` - porta HTTP (default `3039`)
- `MTK_ENCRYPTION_KEY` - chave usada para criptografar credenciais do legado
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` - acesso servidor ao storage privado de protocolos
- `REGULARIZE_LICENSE_PROTOCOL_BUCKET` - bucket privado dos protocolos (default `regularize-license-protocols`)
- Protocolos aceitos: PDF, JPG, PNG ou WebP, com limite de **10 MB** por arquivo; o acesso de leitura usa URL assinada temporária e o caminho interno não é exposto.
- `AUDIT_SERVICE_TOKEN` - token usado na integracao de auditoria
- `REGULARIZE_SERVICE_INTERNAL_TOKEN` - token exclusivo compartilhado apenas pelo gateway e pelo regularize-service para o contexto encaminhado e as rotas internas; em desenvolvimento, se ausente, mantem fallback de compatibilidade para `INTERNAL_SERVICE_TOKEN` e `AUDIT_SERVICE_TOKEN`
- `INTERNAL_SERVICE_TOKEN` - nome legado aceito para as rotas `POST /internal/reconciliation/*` pelo header `x-internal-service-token`
- `REGULARIZE_REPORTING_TOKEN` e `REGULARIZE_REPORTING_GRANT_SECRET` - credenciais exclusivas do adapter interno de relatórios
- `SERVICE_ALLOWED_ORIGINS` - origens CORS aceitas; em producao nao pode ficar como `*`
- `ENABLE_API_DOCS` - documentacao OpenAPI em `/docs` (default ligado fora de producao)
- `LOG_LEVEL`, `LOG_PRETTY` - configuracao de logs
- `REGULARIZE_ENABLE_RECONCILIATION_SCHEDULE`
- `REGULARIZE_LICENSE_NOTIFICATION_CRON`
- `REGULARIZE_CLIENT_PF_STATUS_CRON`
- `REGULARIZE_CLIENT_PF_DOCUMENTS_CRON`
- `REGULARIZE_RECONCILIATION_TIMEZONE`

## Gateway

- URL upstream: `REGULARIZE_SERVICE_URL` (ex.: `http://localhost:3039`)
- Token upstream: `REGULARIZE_SERVICE_INTERNAL_TOKEN` (deve ser o mesmo no gateway e no serviço; em produção, diferente de `AUDIT_SERVICE_TOKEN`)
- Prefixo publico: `/regularize`
- Endpoints internos `/internal/*` nao devem ser expostos via gateway

Exemplos de paths publicos:

- `/regularize/passwords`
- `/regularize/pf`
- `/regularize/pfs`
  - aceita `status`, `search`, `page` e `limit`; retorna uma página com `data`, `total` e `hasMore`.
- `/regularize/partners`
- `/regularize/groups/:id/map` - mapa gerado do grupo: cidade, sócio e empresas com vínculo societário vigente
- `/regularize/groups/:id/map/saved` - lê (GET) ou substitui (PUT) a versão editada do mapa do grupo; gerar de novo não a altera
- `/regularize/municipal-taxes`
- `/regularize/dte/import` - importa avisos DTE colados em HTML ou JSON; leitor verificado só com casos sintéticos
- `/regularize/dte/imports` - importações da organização, com recusas e duplicatas
- `/regularize/dte/notices` - caixa de avisos importados; sem `from`, últimos 45 dias pela data de emissão do aviso
- `/regularize/dte/notices/reading` - altera o estado de leitura de um aviso, com registro em `logs`
- `/regularize/dte/queries?date=aaaa-mm-dd` - grade de consultas diárias ao DTE por cliente
- `/regularize/dte/queries/status` - marca a consulta de um cliente como feita, não feita ou sem registro, com registro em `logs`
- `/regularize/dte/queries/import` - registra as consultas do dia pelas listas de CPF/CNPJ feitas e não feitas
- `/regularize/veri/compare` - compara um XLSX do Veri com a carteira pelo CPF/CNPJ; nada é gravado, por isso basta permissão Regularize 1; leitor verificado só com casos sintéticos
- `/regularize/process`
- `/regularize/processes`
- `/regularize/guidance`
- `/regularize/guidance/pdf?id=<uuid>` - PDF da orientação selecionada, com leitura restrita à organização autenticada
- `/regularize/license`
- `/regularize/license/:id/protocol` - substitui o arquivo vigente ou gera acesso assinado temporario
- `/regularize/licenses`

Infraestrutura direto no servico: `GET /health` e, quando habilitado, `GET /docs`.

## PDF de orientação processual

Referência: `workspace/regularize/pages/processos/orientacao.php`, ramo `?print=<id>` do
Workspace antigo, e `workspace/assets/css/style-regularize.css` (cor `#cf6363`, cabeçalho
e seções com bordas vermelhas). O ramo `?print2` é o checklist separado e não integra
este documento. O padrão usa o logo Regularize, sem seleção de timbrado da Central de
Relatórios.

Os dados vêm somente da orientação consultada por `id` e `organization_id`. Solicitação,
observação, dados da empresa, atividades, objeto social e sócios correspondem aos campos
homônimos de `ProceduralGuidance`; dados de `target_snapshot` da mesma orientação são usados
quando o campo principal está ausente. A filial usa `branch_data` (`name`, `document`,
`address`, `city`, `state`). O contrato atual não registra IPTU, atividades ou objeto social
da filial: esses rótulos permanecem vazios no PDF. Também não há equivalente separado para
o campo legado `orientaoes_filiais.atividades`. Campos opcionais ausentes não recebem
valores fictícios. A seção “Não alterado” deriva apenas dos tópicos ausentes da solicitação
de alteração contratual, como no impresso legado.
O endpoint impede cache do PDF e retorna 422 quando a orientação supera 32 KiB de dados,
50 sócios ou 100 atividades; não corta o conteúdo para caber no documento.

## Rotas internas

As rotas internas ficam montadas diretamente no servico sob `/internal` e exigem `INTERNAL_SERVICE_TOKEN`:

- `POST /internal/reconciliation/run`
- `POST /internal/reconciliation/license-notifications/run`
- `POST /internal/reconciliation/client-pf-status/run`
- `POST /internal/reconciliation/client-pf-documents/run`
- `GET /internal/reporting/catalog` e `POST /internal/reporting/extract` (fontes `regularize.licenses`,
  `regularize.processes`, `regularize.municipal_taxes`, `regularize.clients`, `regularize.client_groups`, `regularize.clients_pf` e `regularize.partners`, somente reports-service, fora do gateway; exigem token e grant de relatório)

## Reconciliacao agendada

- habilite com `REGULARIZE_ENABLE_RECONCILIATION_SCHEDULE=true`
- defaults legados:
  - alvaras: `30 4 * * *`
  - status PF: `* 5 * * *`
  - documentos PF: `30 5 * * *`
  - timezone: `America/Sao_Paulo`

## Desenvolvimento

```bash
pnpm --filter @workspace/regularize-service dev
```

Testes:

```bash
pnpm --filter @workspace/regularize-service test
```

Cobertura do manifesto smoke:

```bash
pnpm smoke:coverage
```

As operacoes OpenAPI do regularize estao no manifesto smoke, mas as probes runtime nao-health ficam desabilitadas por default ate existirem handlers com fixtures. Para habilitar uma execucao runtime dessas probes, configure `REGULARIZE_SMOKE_ENABLED=true`.

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
