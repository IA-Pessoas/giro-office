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
  exige `Idempotency-Key` e a `revision` da prévia. O serviço revalida a composição antes de criar;
  Modelo repetido ou prévia desatualizada retorna `409`.
- `POST /task/project-wizard/extract-tasks` transforma uma Ata de reunião colada em Tarefas
  propostas com a OpenAI. Exige nível `2+` em Integração ou `owner` e respeita o isolamento da
  organização. O corpo aceita `content` (Ata), `name`, `objective`, `start_date` e `end_date`
  opcional. A resposta traz `tasks` com `name` e, quando houver correspondência clara na
  organização, `prevision_date`, `department_id` e `model_id`. Zero propostas retorna `422`;
  formato incompatível, timeout ou falha do provedor retornam `502`; Ata acima de 100.000
  caracteres é rejeitada com `400` antes do provedor. A Ata é tratada como dado não confiável, vai
  ao provedor apenas como conteúdo do usuário e não é persistida, auditada nem registrada em log. O
  payload enviado ao provedor contém somente nome, objetivo e datas do Projeto, nomes de
  departamentos ativos e nomes de Modelos de tarefa do tipo `Projeto` da organização.

`/internal/reporting` é contrato direto interno, não roteado pelo gateway.

## Desenvolvimento

```bash
pnpm --filter @workspace/task-service dev
```
