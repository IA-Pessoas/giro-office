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
- `POST /task/project-wizard` cria um projeto com uma lista, inclusive vazia, de tarefas manuais e
  exige `Idempotency-Key`. Cada tarefa exige nome, departamento e modelo; prazo e responsável são
  opcionais, e o responsável também aceita `null`.

`/internal/reporting` é contrato direto interno, não roteado pelo gateway.

## Desenvolvimento

```bash
pnpm --filter @workspace/task-service dev
```
