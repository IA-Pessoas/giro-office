# Runbook de operação — Central de Relatórios

Este runbook cobre a operação segura do HTTP e do worker do `reports-service` em produção. O
gateway publica a API em `/reports`; o serviço de relatórios é a fonte de autorização, catálogo,
jobs, snapshots e exportações.

## Pré-requisitos e configuração

HTTP e worker devem usar o mesmo `DATABASE_URL`, `JWT_SECRET`, `REPORTS_INTERNAL_TOKEN` e
`REPORTS_GRANT_SECRET`. O gateway deve apontar `REPORTS_SERVICE_URL` para o HTTP. Configure também
`USER_SERVICE_URL` e as URLs dos serviços de origem usadas pelos adapters (`PARCELAMENTO_SERVICE_URL`,
`CLIENT_SERVICE_URL`, `PROJECT_SERVICE_URL`, `TASK_SERVICE_URL`, `CONTABIL_SERVICE_URL`,
`CERTIFICATE_SERVICE_URL`, `FISCAL_SERVICE_URL`, `PESSOAL_SERVICE_URL`, `REGULARIZE_SERVICE_URL`,
`TI_SERVICE_URL` e `RH_SERVICE_URL`) conforme o inventário habilitado.

Parâmetros operacionais principais:

- HTTP: `PORT`, `SERVICE_ALLOWED_ORIGINS`, `REPORTS_SOURCE_TIMEOUT_MS`,
  `REPORTS_ADAPTER_TIMEOUT_MS` e `REPORTS_PREVIEW_ROW_LIMIT`.
- Worker: `REPORTS_WORKER_POLL_INTERVAL_MS`, `REPORTS_WORKER_CONCURRENCY` e
  `REPORTS_WORKER_LEASE_SECONDS`.
- Auditoria: `AUDIT_ENABLED`, `AUDIT_SERVICE_URL` e `AUDIT_SERVICE_TOKEN`.

Não registre esses valores em logs, tickets ou comandos compartilhados. Em produção, tokens e
segredos devem ser valores não padrão e os origins devem ser explícitos.

## Inicialização e release

Execute o HTTP e o worker como processos separados, com a mesma revisão e configuração:

```bash
pnpm --filter @workspace/reports-service dev
pnpm --filter @workspace/reports-service worker
```

Antes de liberar tráfego, valide `/health`, `/ready`, a especificação agregada do gateway e o
smoke de cobertura. Em ambiente isolado, execute o smoke de relatórios com o worker ativo e as
credenciais de origem configuradas. O smoke deve cobrir, com uma expectativa boa e uma ruim por
operação pública, criação, preview vazio, job, cancelamento, snapshot, CSV, XLSX, PDF, modelo
compartilhado, saída de departamento, expiração e exclusão antecipada.
Para testar uma expiração já existente, forneça `SMOKE_REPORT_EXPIRED_SNAPSHOT_ID` apontando para
um snapshot expirado do ambiente isolado; sem essa variável, o caso negativo usa um identificador
ausente e confirma a mesma barreira de exportação.

## Job falho e nova geração

1. Preserve o job falho e seu `jobId`; não altere status, payload ou snapshot diretamente no banco.
2. Correlacione `requestId`, `jobId`, `reportModelVersionId`, status, classe do erro e serviço de
   origem. Confirme lease, timeout, permissão atual e disponibilidade da origem.
3. Corrija a causa operacional ou de autorização e crie uma nova geração por `POST /reports/jobs`,
   usando a definição publicada ou `modelVersionId` autorizado no momento da solicitação.
4. Aguarde um novo snapshot concluído. Não reutilize snapshot de um job falho, cancelado ou
   expirado e não faça retry por mutação manual.

Uma perda de permissão durante a execução deve resultar em falha sem materialização. Uma mudança
de departamento deve retirar o acesso ao acervo compartilhado; não conceda exceção operacional
para contornar essa revalidação.

## Investigação sem abrir conteúdo

Use somente `requestId`, `jobId`, versão do modelo, organização/departamento autorizados, status,
timestamps, duração, formato, resultado e contagens seguras de linhas/bytes. Combine os eventos de
auditoria com logs do worker, gateway e serviço de origem. A auditoria não deve conter definição,
filtros, valores de linha, URLs com segredo, justificativa textual ou conteúdo exportado.

Métricas permitidas: jobs por status, duração/idade da fila, conflitos e expiração de lease,
latência e erros por adapter, exports por formato e resultado, bytes/linhas por operação e
quantidade de snapshots expirados ou removidos. Não use labels ou dimensões que carreguem IDs,
valores de campos ou dados do relatório.

## Rotação de tokens

Faça rollout coordenado para `REPORTS_INTERNAL_TOKEN` e `REPORTS_GRANT_SECRET`, incluindo os
serviços de origem que validam os grants. Se o mecanismo de secrets suportar dupla credencial,
aceite a nova e a antiga durante a janela de rollout; reinicie HTTP, worker e gateway; valide
health/ready e smoke; depois revogue a antiga. Sem dupla credencial, faça a troca em janela
controlada e confirme que nenhum processo ficou com a configuração anterior. Procure somente por
falhas de autenticação e correlação nos logs — nunca imprima o token para diagnosticar.

## PDF, timbrado e fallback

Para relatório compartilhado, o timbrado aprovado do departamento tem precedência; para relatório
pessoal, use o timbrado aprovado da organização. O serviço valida o SHA-256 antes de desenhar o
PDF. Na ausência de asset aprovado, o fallback institucional é permitido e deve emitir o aviso
operacional `Timbrado aprovado ausente; usando fallback institucional.`

Se a política do cliente exigir timbrado, trate esse aviso como falha de release e corrija o asset;
não substitua o arquivo manualmente nem exponha IDs da organização/departamento. Em qualquer caso,
o PDF deve conter somente colunas selecionadas e valores autorizados.

## Checklist rápido

- [ ] `/health` e `/ready` respondem no gateway e no HTTP.
- [ ] A especificação agregada contém todas as rotas `/reports` e o audit target é
      `reports-service`.
- [ ] `pnpm smoke:coverage` passa e o smoke de relatórios tem pares good/bad.
- [ ] Criação, preview vazio, job, cancelamento, snapshot e CSV/XLSX/PDF foram exercitados.
- [ ] Revogação de permissão, saída de departamento, snapshot expirado e exclusão sem justificativa
      retornam erro sem dados de conteúdo.
- [ ] Worker ativo, lease/concurrency definidos e auditoria sem conteúdo sensível.
- [ ] Rotação de token e seleção de timbrado/fallback foram verificadas na janela de release.
