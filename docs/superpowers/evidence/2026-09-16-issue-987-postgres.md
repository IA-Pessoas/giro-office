# Issue #987 — confirmação com PostgreSQL efêmero

Data: 2026-09-16. Base de integração: `4e08991a4710ceafd9da5cfef8da0f3126d911dd`.
Branch: `codex/issue-987`, criada de `feature/milestone-15`.

A revisão final do milestone 15 encontrou a ausência de execução dos seis testes
opt-in. A tentativa na árvore original falhou no setup: o pnpm aninhado emitia
um aviso de workspace no stdout, que era enviado ao PostgreSQL junto com o DDL.
A correção acrescenta `--silent` apenas ao subprocesso que gera o SQL. Não altera
código de produção, assertions, schema ou migrations.

## Resultado

`PROJECT_WIZARD_POSTGRES_TEST=1 pnpm --filter @workspace/task-service test --maxWorkers=1`
passou: **42 arquivos, 401 testes, zero testes ignorados**, duração 91,83 segundos.
Os seis cenários antes ignorados foram executados:

| Critério | Evidência PostgreSQL | Status |
| --- | --- | --- |
| Atomicidade | Falha na última dependência reverte Projeto, Tarefas e chave; retry cria uma composição | Aprovado |
| Concorrência e replay | Duas confirmações simultâneas devolvem o mesmo snapshot e persistem uma composição | Aprovado |
| Isolamento organizacional | Mesma chave funciona independentemente em organizações distintas | Aprovado |
| Exclusão e replay | Exclusão de Projeto sem Tarefas preserva a confirmação original | Aprovado |
| Comando incompatível | Mesma chave com conteúdo diferente retorna 409 sem alteração | Aprovado |
| Auditoria | Executa após commit, tolera falha, preserva privacidade e não repete no replay | Aprovado |

O harness cria seu próprio `postgres:17-alpine`, com dados em tmpfs, porta efêmera
restrita a loopback e remoção automática. Ele não carrega `.env` nem usa URL de
banco fornecida pelo usuário. A comparação dos 44 containers preexistentes antes
e depois confirmou os mesmos IDs, imagens, horários de início e reinícios.
Nenhum container de teste permaneceu após a execução. Não houve deploy.

Imagem usada: `postgres@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`.

## Verificações complementares

- `pnpm exec biome check services/task-service/src/test/projectWizardPostgres.routes.test.ts`: aprovado.
- `DATABASE_URL=postgresql://127.0.0.1:1/unused pnpm --filter @workspace/task-service typecheck`: aprovado.
- Preparação local: instalação offline com lockfile congelado e scripts desabilitados,
  build do shared e geração Prisma com URL fictícia (sem conexão).
- `code-simplifier-v2` e `code-reviewer`: diff mínimo de uma opção; nenhum achado
  Critical/Important na correção. Revisão final independente ainda é etapa separada.
- Graphify sem grafo local; descoberta manual do harness, configuração Prisma e rotas.

SHA-256 do harness validado: `fbd2530b32375eb4dad8a857018dbe7899cdc84ffa32eb686f97105f34a0f0d4`.
SHA-256 do log completo: `50f6f6b9cba9e9fec3cd96ef05d4a58bc4c9d3ebcd0bc4018a8ca7e828b8a2d5`.
O log local está em `/var/tmp/giro-milestones-20260916/continue-20260916/issue-987-postgres-green.log`.
CI remoto e merge serão registrados no PR; esta evidência comprova execução local.
