# task-service

Microserviço de tarefas / integrações de tasks. O gateway encaminha **apenas** caminhos listados em código; o restante vai para o legado.

## Porta local

Por defeito: **3337** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`, opcionalmente `AUDIT_*` para gravação de auditoria a partir do serviço.

## Gateway

- URL upstream: `TASK_SERVICE_URL` (ex.: `http://localhost:3337`).
- Registo de caminhos: [`gateway/src/utils/routeUtils.ts`](../gateway/src/utils/routeUtils.ts) — conjunto `TASK_SERVICE_EXACT_PATHS` e função `isTaskServiceRoute`.
- **Ao expor uma rota nova de tasks pela API pública**, adicionar o path exato a esse conjunto; caso contrário o pedido será enviado para `LEGACY_API_URL`.

Exemplos de paths atualmente encaminhados: `/comercial-tasks`, `/financeiro-tasks`, `/integracao-tasks`, etc.

## Desenvolvimento

```bash
pnpm --filter @workspace/task-service dev
```
