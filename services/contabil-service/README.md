# contabil-service

Microserviço de domínio contábil: checklist operacional por cliente e competência (**controls**), **responsibles** e **relationships** do cliente. Todas as rotas de negócio ficam sob o prefixo `/contabil` e exigem autenticação (JWT ou headers encaminhados pelo gateway).

## Porta local

Por padrão: **3038** (`PORT` em [`src/config/env.ts`](src/config/env.ts)).

## Variáveis de ambiente

Definição e defaults em [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL` — PostgreSQL (Prisma)
- `DATABASE_POOL_MAX` — teto do pool por processo (default `1`)
- `JWT_SECRET` — validação do Bearer nas rotas autenticadas
- `PORT` — porta HTTP (default `3038`)
- `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN` — auditoria via `integrations/audit.ts`
- `INTERNAL_SERVICE_TOKEN` — token esperado no header interno quando o gateway encaminha usuário/organização (opcional; se omitido, usa o mesmo valor que `AUDIT_SERVICE_TOKEN`)
- `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` — autenticação e grants HMAC curtos do Reports para `/internal/reporting`
- `TRIAGEM_SERVICE_URL`, `TRIAGEM_INTERNAL_TOKEN`, `TRIAGEM_REQUEST_TIMEOUT_MS` — cliente interno somente leitura do resumo da Triagem
- `ENABLE_API_DOCS` — documentação OpenAPI em `/docs` (em produção o default é desligado)

## Gateway

No gateway, configure o upstream:

- `CONTABIL_SERVICE_URL` — URL base do serviço (ex.: `http://localhost:3038`)

Prefixo público no gateway: **`/contabil`**.

Exemplos de paths públicos (via gateway, com `Authorization: Bearer …`):

- `GET http://localhost:3010/contabil/controls?client_id=<uuid>&competence=<YYYY-MM>`
- `GET http://localhost:3010/contabil/controls/list?competence=<YYYY-MM>`
- `POST http://localhost:3010/contabil/controls`
- `POST http://localhost:3010/contabil/controls/year` (exige `confirmed: true`)
- `PATCH http://localhost:3010/contabil/controls/<id>/items` (conclui os 17 itens)
- `DELETE http://localhost:3010/contabil/controls` e `POST http://localhost:3010/contabil/controls/restore`
- `PATCH http://localhost:3010/contabil/controls/<id>`
- `POST http://localhost:3010/contabil/responsibles`
- `GET http://localhost:3010/contabil/responsibles/client/<clientId>`
- `PUT http://localhost:3010/contabil/responsibles/<id>`
- `DELETE http://localhost:3010/contabil/responsibles/<id>`
- `POST http://localhost:3010/contabil/relationships`
- `GET http://localhost:3010/contabil/relationships/client/<clientId>`
- `PUT http://localhost:3010/contabil/relationships/<id>`
- `DELETE http://localhost:3010/contabil/relationships/<id>`
- `GET|POST http://localhost:3010/triagem/monthly`
- `GET http://localhost:3010/triagem/fiscal-portfolio?competence=<YYYY-MM>`
- `GET|PUT|DELETE http://localhost:3010/triagem/statements`
- `GET|PUT|DELETE http://localhost:3010/triagem/closing`

As atualizações fiscais de itens também aceitam `justification`, `delivery_method` e `state_site`;
esses valores são validados no catálogo da organização ou no snapshot da competência.

Infraestrutura direto no serviço: `GET http://localhost:3038/health` e `GET http://localhost:3038/ready`.
`/internal/reporting/*` é contrato interno direto; não passa pelo gateway.

## Desenvolvimento

```bash
pnpm --filter @workspace/contabil-service dev
```

## Conversão Noah

`POST /contabil/noah?filename=comprovantes.zip` recebe bytes `application/zip` e exige
permissão de edição no Contábil. Retorna 201 com identificador, rejeições por arquivo,
quantidades, ator, instante e hashes SHA-256 da origem e do CSV. O resultado é imutável
e persistido em `contabil.noah_conversions`; o ZIP/HTML só permanece em memória durante
a requisição. `GET /contabil/noah/:id/csv` exige leitura e consulta somente a organização
autenticada. O gateway encaminha o upload binário e o download pelo mesmo prefixo.

Limites: ZIP de 5 MiB, 100 entradas, 1 MiB por HTML, 10 MiB expandidos e 10.000 pagamentos.
Não extrai no filesystem, não executa HTML e rejeita caminhos inseguros, symlinks,
arquivos corrompidos e pagamentos inválidos. O CSV usa UTF-8, ponto e vírgula e as quatro
colunas `FORNECEDOR;DATA;VALOR;ARQUIVO`; células que poderiam executar fórmulas recebem
um apóstrofo inicial. Nenhum lançamento, Controle ou checklist é alterado.

Regras de extração: `classes/Contabil.php` do legado (tabela `TBLResultado`, colunas
1/6/7 e alternativas 5/6). Validação usa casos sintéticos; compatibilidade com ZIPs
reais permanece não validada conforme #1716. A migration
`20261009214500_contabil_noah_conversions` deve ser aplicada pelo processo de publicação.

### Comandos locais

```bash
pnpm --filter @workspace/contabil-service dev
```

Gerar cliente Prisma: `pnpm --filter @workspace/contabil-service prisma:generate`.

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.

## Simulação de Contingência

`POST /contabil/contingency` recebe XLS binário em `application/vnd.ms-excel` e os
parâmetros de query `client_id`, `company_name`, `cnpj`, `period_start`, `period_end`
(AAAA-MM), `regime`, `annex`, `rate` (padrão 11) e `filename`. Exige edição no
Contábil. Cliente é consultado com a organização autenticada; empresa/CNPJ devem
coincidir com o cadastro. CNPJ identificado na planilha também deve coincidir;
quando não existe identificação, o resultado informa `identity: not_found`.

O XLS é processado em memória e não é armazenado. Aceita BIFF8/Excel 97–2003, até
5 MiB, 10.000 linhas e 256 colunas na primeira planilha. Rótulos ausentes, células
inválidas e fórmulas nos valores extraídos geram erro explícito. Valores monetários
aceitam números e formatos decimal/BR com até duas casas e magnitude de até R$ 1
trilhão, incluindo negativos entre parênteses. HTML não é interpretado.

A extração segue `gerar_relatorio.php`: rótulos nas colunas I/J/K, valores em U
(exceto bancos em S), mantendo a primeira ocorrência não zero. A resposta privada
(`Cache-Control: no-store`) inclui valores em centavos, valor original e células de
origem; diferença, transferências internas, cenários mínimo/máximo e parâmetros.
Tributo usa a alíquota informada; multa 75%, juros 6%. Arredondamento de cada saída
ocorre depois do cálculo, como no PHP. As classificações são hipóteses do modelo
legado e não comprovam irregularidade. Não cria lançamentos nem altera Controle.
Revisão e exportação fazem parte da #1726.

A fixture e os valores esperados ficam em `scripts/fixtures/contingency/README.md`.
Amostras reais anonimizadas não estão disponíveis (#1716); compatibilidade real
permanece não validada. O parser é `@e965/xlsx@0.20.3`, espelho npm fixado do SheetJS,
pois a política do workspace recusa dependências por URL. Todos os arquivos do
pacote foram comparados com o tarball oficial 0.20.3: só README e package.json
mudam; `xlsx.mjs` tem SHA256
`1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`.
Fonte oficial: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/.
