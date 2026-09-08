# ti-service

Microservico do modulo Tecnologia. Centraliza chamados de TI, inventario, senhas, ramais, termos, estoque filtrado para o departamento Tecnologia e robos/automacoes.

## Porta local

Por padrao: **3040** (`PORT`).

## Variaveis de ambiente

As variaveis sao lidas em `src/config/env.ts`.

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `DATABASE_POOL_MAX` (default `1`)
- `AUDIT_SERVICE_URL`
- `AUDIT_SERVICE_TOKEN`
- `TI_SERVICE_INTERNAL_TOKEN`
- `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` (contrato interno de relatórios)
- `MTK_ENCRYPTION_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TI_REQUEST_IMAGE_BUCKET`
- `SERVICE_ALLOWED_ORIGINS`
- `ENABLE_API_DOCS`
- `LOG_LEVEL`
- `LOG_PRETTY`

## Imagens em mensagens de chamados

`POST /ti/requests/{id}/messages` aceita os dois formatos abaixo:

- `application/json`: mensagem de texto no formato existente (`message`, com `type` opcional).
- `multipart/form-data`: campo `message`, `type` opcional e um unico campo `file` com imagem JPEG,
  PNG ou WebP de ate 5 MiB.

O arquivo e validado antes do armazenamento. Entrada ou assinatura de arquivo invalida retorna `400`;
arquivo acima do limite retorna `413`; uma falha ao armazenar a imagem retorna `500`, sem expor a
configuracao ou as credenciais do Supabase. O upload guarda apenas a chave privada no banco e devolve
uma URL assinada de cinco minutos depois de validar o acesso ao chamado. Configure
`TI_REQUEST_IMAGE_BUCKET` com o valor recomendado `ti-request-attachments-private`, em um
bucket privado dedicado. Crie/configure esse bucket como privado no Supabase Storage (o servico nao le
`BUCKET_VISIBILITY`). `SUPABASE_SERVICE_ROLE_KEY` deve permanecer apenas no ambiente do
servico/VPS, junto com `SUPABASE_URL`.

## Gateway

- URL upstream: `TI_SERVICE_URL` (ex.: `http://localhost:3040`)
- Prefixo publico: `/ti`
- Exemplo: `GET /ti/requests/list`
- Exemplo: `GET /ti/inventory/list`
- Exemplo: `POST /ti/inventory`
- Exemplo: `GET /ti/stock`

As rotas diretas `/internal/reporting/catalog` e `/internal/reporting/extract` são consumidas
exclusivamente pelo reports-service e não passam pelo gateway. O catálogo combinado publica
`ti.inventory` e `ti.stock` sem expor chaves internas; as extrações exigem token interno, grant HMAC
de curta duração, `x-request-id` e permanecem limitadas à organização do grant.

## Relatórios internos

O `reports-service` acessa diretamente `GET /internal/reporting/catalog` e
`POST /internal/reporting/extract`, fora do gateway. As duas operações exigem
`REPORTS_INTERNAL_TOKEN`, grant HMAC de curta duração e `x-request-id`; o contrato publica apenas
as fontes governadas `ti.inventory`, `ti.requests` e `ti.extensions`. Para ramais, expõe somente
ramal e datas de criação/atualização; usuário fica restrito à chave interna do catálogo. Para
chamados, expõe somente título, categoria, urgência, status e datas de criação/atualização;
solicitante e responsável ficam restritos às chaves internas do catálogo.

## Senhas de TI

As rotas de senhas exigem permissão administrativa do módulo TI.

- `GET /ti/passwords/list` lista credenciais ativas por padrão e aceita
  `status=active|inactive|all`.
- `POST /ti/passwords/:id/deactivate` inativa uma credencial com um motivo obrigatório de até
  500 caracteres.

A inativação é apenas no Giro Office: ela não revoga, altera ou rotaciona a senha no sistema
externo. Não há rota de exclusão permanente ou reativação.

## Desenvolvimento

```bash
pnpm --filter @workspace/ti-service dev
```

## Testes

```bash
pnpm --filter @workspace/ti-service test
pnpm --filter @workspace/ti-service typecheck
pnpm turbo run build --filter=@workspace/ti-service
```

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
