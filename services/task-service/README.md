# task-service

Microservico de tarefas. O gateway encaminha esse servico pelo prefixo publico **`/task`**.

Criação de tarefa de projeto exige `department_id`. O responsável deve ser um usuário ativo do mesmo departamento e ser administrador ou liderança de RH (nível 3) na organização; quando há candidatos, um deles precisa ser selecionado. `responsible_id: null` só é aceito quando o departamento não possui candidato elegível. Na edição, atribuições e vínculos legados são preservados quando não enviados, e a remoção explícita do responsável também só é aceita sem candidatos elegíveis.

`GET /task/list` aceita `client_id` como UUID e `assignment=assigned|unassigned`. Os filtros podem ser combinados com status, origem, busca e visibilidade do usuário. Cliente inexistente ou de outra organização retorna `404`, sem ampliar a consulta; valores inválidos retornam `400`.

## Porta local

Por defeito: **3032** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `DATABASE_POOL_MAX` (default `1`)
- `JWT_SECRET`
- `PROJECT_SERVICE_URL`
- `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` para fonte interna de relatórios
- `COMMERCIAL_SERVICE_TOKEN` para os contratos internos de fechamento comercial e projeção de cobrança do `commercial-service`
- `AUDIT_*` quando a auditoria estiver ativa
- `AI_EXTRACTION_MODE` (`fake` por padrao, ou `openai`) escolhe o provedor da extracao de tarefas
  do wizard de Projetos. `fake` usa um adapter deterministico local, sem rede nem creditos;
  `openai` exige `OPENAI_API_KEY`. Em producao o servico so sobe com `openai` e chave presente.
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` e `AI_EXTRACTION_TIMEOUT_MS` configuram o
  provedor. Nunca versione a chave.
- `AI_EXTRACTION_RATE_LIMIT_MAX` (default `10`) e `AI_EXTRACTION_RATE_LIMIT_WINDOW_MS`
  (default `60000`) limitam extracoes por usuario e organizacao

## Gateway

- URL upstream: `TASK_SERVICE_URL` (ex.: `http://localhost:3032`)
- Prefixo publico: `/task`

Exemplos de paths publicos:

- `/task`
- `/task/list`
- `/task/model`
- `/task/model/list`
- `/task/project-plan`
- `/task/project-plan/list`
- `/task/deps/list`
- `POST /task/project-wizard/preview` compõe tarefas principais e dependências diretas canônicas e
  retorna uma `revision` opaca. Exige Integração nível 2+ ou owner.
- `POST /task/project-wizard` cria o projeto com a lista, inclusive vazia, de tarefas principais e
  exige `Idempotency-Key` e a `revision` da prévia. Recompõe e persiste Projeto, Tarefas e confirmação
  na mesma transação: uma falha reverte tudo. Na mesma organização, pedidos concorrentes ou replay
  da mesma chave/comando retornam o snapshot original com `201`, sem criar novamente. A chave com
  comando diferente, Modelo repetido ou prévia desatualizada retorna `409`.
- A confirmação nova emite auditoria após o commit, com IDs e contagens, sem nomes, objetivo,
  observações ou chave. Falha na auditoria não altera a resposta; replay não emite nova auditoria.
- `POST /task/project-wizard/extract-tasks` transforma uma Ata de reunião colada ou enviada em TXT,
  Markdown, DOCX ou PDF em Tarefas propostas com a OpenAI. Exige nível `2+` em Integração ou `owner`
  e respeita o isolamento da organização. O conteúdo textual decodificado aceita até 10 MiB em bytes
  UTF-8; no JSON, o parser reserva headroom técnico para envelope e escaping sem alterar esse limite
  da fonte. A requisição aceita `content` (Ata), `name`, `objective`, `start_date` e `end_date` opcional;
  `multipart/form-data` aceita os mesmos campos e um único `file` `.txt` (`text/plain`), `.md`
  (`text/markdown`, `text/plain` ou `text/x-markdown`), `.docx`
  (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) ou `.pdf`
  (`application/pdf`) de até 10 MB. Do DOCX é lido apenas o texto de `word/document.xml`: macros, campos ativos como HYPERLINK
  e demais conteúdos ativos não são executados nem repassados ao provedor; documento corrompido,
  protegido por senha, sem texto ou fora do padrão OOXML é rejeitado com `400` antes do provedor e
  sem consumir tentativa. Do PDF é lida apenas a camada textual já presente no arquivo: ações,
  JavaScript, formulários e imagens são ignorados e nenhum OCR é acionado, então PDF digitalizado
  fica sem texto e é rejeitado com `400` antes do provedor, assim como PDF corrompido, protegido
  por senha ou com assinatura divergente de `%PDF-`. A resposta traz `tasks`
  com `name` e, quando houver correspondência clara na
  organização, `prevision_date`, `department_id` e `model_id`. Zero propostas retorna `422`;
  formato incompatível, timeout ou falha do provedor retornam `502`. Atas extensas são processadas
  integralmente em partes, na ordem; uma falha em qualquer parte invalida a Ata inteira e nenhuma
  proposta parcial é devolvida. A Ata é tratada como dado não confiável, vai
  ao provedor apenas como conteúdo do usuário e não é persistida, auditada nem registrada em log. O
  payload enviado ao provedor contém somente nome, objetivo e datas do Projeto, nomes de
  departamentos ativos e nomes de Modelos de tarefa do tipo `Projeto` da organização.

`/internal/reporting` é contrato direto interno, não roteado pelo gateway.
`/internal/commercial/task-billing` é contrato direto interno, protegido por `COMMERCIAL_SERVICE_TOKEN`.
O antigo `PUT /task/comercial` foi removido no corte; cobrança pública ocorre em `/commercial/task-billing`.

## Desenvolvimento

```bash
pnpm --filter @workspace/task-service dev
```

Teste da confirmação com PostgreSQL descartável (Docker local e imagem `postgres:17-alpine`):

```bash
PROJECT_WIZARD_POSTGRES_TEST=1 pnpm --filter @workspace/task-service exec vitest run src/test/projectWizardPostgres.routes.test.ts
```

O harness gera o schema real, aplica a migration da confirmação e remove seu container/dados ao
terminar. Usa porta aleatória em `127.0.0.1`, sem carregar `.env` ou aceitar URL de banco externo.

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
