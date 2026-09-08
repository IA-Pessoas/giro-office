# Relatório — Task 1 do plano #995

Data: 2026-09-08
Branch: `codex/issue-995-contracts-privacy-operation`
Base verificada: `origin/develop@fda3bc54ea295913841a130c2f8f7db96ba85d56`

## Status

Concluída no escopo original do Task 1. Os testes públicos do `task-service` e do gateway cobrem as três rotas do
Project Wizard, autorização, ordem entre validação e rate limit, payload allowlisted ao provedor,
privacidade de logs/auditoria e contratos estáveis de erro.

Um RED reproduziu uma lacuna de produção: o gateway removia o token interno fornecido pelo cliente,
mas não colocava o token confiável configurado ao encaminhar chamadas ao `task-service`. Como o
`task-service` exige esse token junto aos headers de identidade encaminhada, as três rotas não
formavam um contrato autenticado completo através do proxy público.

A correção original de produção ficou em duas linhas: o proxy regular do `task-service` e o proxy
especial de extração passaram a receber `env.auditServiceToken`, reutilizando a credencial já
exigida pelo serviço. Após a revisão final, o proxy especial passou a reutilizar `targetUrl` e
`internalServiceToken` da definição do `task-service` na registry; somente o timeout excepcional
permanece local.

## Cronologia posterior ao Task 1

- O Task 2 adicionou a documentação operacional em `docs/vps-deploy.md` e executou
  `pnpm smoke:coverage` antes e depois da edição, com `419/421` operações mapeadas.
- O Task 3 executou depois o smoke público do app com
  `pnpm run test:project-wizard-browser`, após preparar `@workspace/api`; os dois cenários passaram.
- A correção dos findings da revisão final adicionou as asserções explícitas de status `401/403`,
  alinhou `AUDIT_SERVICE_TOKEN` na documentação VPS e removeu a duplicação de configuração do proxy
  especial. Depois dela, passaram: gateway `project-wizard` (`4/4`), registry (`26/26`),
  `smoke:coverage` (`419/421`), typecheck do gateway, Biome escopado e `git diff --check`.

As seções abaixo preservam a evidência histórica da execução original do Task 1; quando mencionam
ausência de docs, smoke ou app, descrevem aquela etapa, não o head final da branch.

## RED

### Preparação do worktree

Primeira tentativa:

```text
pnpm --filter @workspace/gateway exec vitest run src/app.routes.test.ts -t "proxies the three project-wizard routes with trusted authenticated context"
```

Saída: a suíte não chegou aos testes porque `@workspace/shared/testUtils` ainda não tinha artefatos
`dist` neste worktree. Isso foi classificado como falha de setup, não como RED funcional.

Preparação executada:

```text
pnpm --filter @workspace/shared build
```

Saída: exit code 0.

### RED funcional

Com o novo teste escrito antes da correção:

```text
pnpm --filter @workspace/gateway exec vitest run src/app.routes.test.ts -t "proxies the three project-wizard routes with trusted authenticated context"
```

Saída relevante:

```text
Test Files  1 failed (1)
Tests       1 failed | 116 skipped (117)
Expected internalToken: "audit-service-token"
Received internalToken: undefined
```

O teste observou as chamadas reais do gateway para as três URLs públicas e falhou exatamente porque
o token confiável não chegava ao upstream.

## GREEN

### Gateway focado

```text
pnpm --filter @workspace/gateway exec vitest run src/app.routes.test.ts -t "project-wizard"
```

Saída:

```text
Test Files  1 passed (1)
Tests       4 passed | 113 skipped (117)
Exit code   0
```

Os casos exercitam:

- proxy das três rotas, com body, identidade autenticada, módulo de Integração e token interno;
- `401/UNAUTHORIZED` e `403/FORBIDDEN` antes de qualquer hit no upstream;
- exclusão de Ata, identidade do cliente e e-mail de responsável dos logs e da auditoria;
- erro público `502/BAD_GATEWAY` com mensagem estável.

### Task-service focado

Preparação do Prisma local:

```text
DATABASE_URL=postgresql://test:test@127.0.0.1:5432/test \
  pnpm --filter @workspace/task-service prisma:generate
```

O valor é descartável e foi usado apenas para o comando de geração; nenhum banco foi acessado.

```text
pnpm --filter @workspace/task-service exec vitest run \
  src/test/projectWizard.routes.test.ts \
  src/test/projectWizardExtractionService.test.ts
```

Saída:

```text
Test Files  2 passed (2)
Tests       129 passed (129)
Exit code   0
```

Os casos adicionados/reforçados comprovam:

- autenticação e autorização de Integração para prévia, confirmação e extração;
- mensagens e códigos estáveis para `400`, `401`, `403`, `409`, `422`, `429` e `502`;
- chaves privadas desconhecidas rejeitadas antes do contador e do provedor;
- um request inválido não consome a única tentativa disponível no rate limit do teste;
- nenhum valor sentinela de cliente, e-mail ou CPF chega a logs ou auditoria;
- o input ao provedor contém exatamente `content` e o contexto allowlisted, sem IDs de usuário,
  organização, departamento ou Modelo.

## Regressão completa dos pacotes

```text
VITEST_MAX_WORKERS=2 pnpm --filter @workspace/gateway test
```

Saída:

```text
Test Files  19 passed (19)
Tests       397 passed (397)
Exit code   0
```

Na primeira execução completa, o teste antigo de antiforja esperava ausência total do token interno.
Ele foi corrigido para provar o comportamento correto: o valor enviado pelo cliente é substituído
por `audit-service-token`, e nunca é confiado.

```text
VITEST_MAX_WORKERS=2 pnpm --filter @workspace/task-service test
```

Saída:

```text
Test Files  38 passed | 1 skipped (39)
Tests       380 passed | 6 skipped (386)
Exit code   0
```

Os seis skips pertencem ao harness PostgreSQL opt-in existente em
`projectWizardPostgres.routes.test.ts`, condicionado a `PROJECT_WIZARD_POSTGRES_TEST=1`.

## Typecheck e formato

```text
pnpm --filter @workspace/gateway typecheck
```

Saída: exit code 0.

```text
DATABASE_URL=postgresql://test:test@127.0.0.1:5432/test \
  pnpm --filter @workspace/task-service typecheck
```

Saída: Prisma gerado e `tsc --noEmit` com exit code 0.

```text
pnpm exec biome check \
  services/gateway/src/app.ts \
  services/gateway/src/config/serviceRegistry.ts \
  services/gateway/src/app.routes.test.ts \
  services/task-service/src/test/projectWizard.routes.test.ts \
  services/task-service/src/test/projectWizardExtractionService.test.ts
```

Saída:

```text
Checked 5 files in 191ms. No fixes applied.
Exit code 0
```

```text
git diff --check
```

Saída: vazia; exit code 0.

## Arquivos alterados no Task 1 original

- `services/gateway/src/app.ts`: passa o token interno ao proxy especial de extração.
- `services/gateway/src/config/serviceRegistry.ts`: passa o token interno ao proxy regular do
  `task-service`.
- `services/gateway/src/app.routes.test.ts`: contrato público das três rotas, negações, antiforja,
  privacidade e erro estável.
- `services/task-service/src/test/projectWizard.routes.test.ts`: autorização das três rotas,
  privacidade/ordem do rate limit e códigos/mensagens de erro.
- `services/task-service/src/test/projectWizardExtractionService.test.ts`: input completo e
  allowlisted entregue ao provedor.
- `.superpowers/sdd/plan-issue-995/task-1-report.md`: este relatório.

O Task 2 alterou depois `docs/vps-deploy.md`; o Task 3 apenas verificou o app. A correção da revisão
final alterou novamente `services/gateway/src/app.ts`, `services/gateway/src/app.routes.test.ts`,
`docs/vps-deploy.md` e este relatório. O arquivo preexistente e não rastreado
`.superpowers/plan-issue-995.md` foi somente lido e permanece fora dos commits.

## Self-review do Task 1 original e revisão final

### Standards

Na self-review original foi registrado nenhum finding. A revisão final encontrou um minor: o proxy
especial ainda duplicava `targetUrl` e `internalServiceToken` fora da registry. O finding foi
corrigido no head final.

- A correção final reutiliza a definição já existente de `task-service`; não cria registry, mapa de
  configuração, abstração ou dependência nova.
- O proxy especial preserva exclusivamente o timeout especial já existente.
- Os testes permanecem em Vitest, nos arquivos públicos já existentes, com imports ESM e sem rede
  externa ou infraestrutura nova.
- Biome, TypeScript e `git diff --check` passaram.

### Spec

Nenhum finding.

- As três rotas estão cobertas no `task-service` e no gateway.
- `401` e `403` são provados antes de atingir o upstream; owner/sucesso já permanecem cobertos pela
  suíte existente.
- Validação precede rate limit, que precede provider.
- Payload ao provedor é fechado e sem IDs internos.
- Ata, resposta bruta e sentinelas de cliente/responsável não entram em logs/auditoria.
- Erros relevantes têm status, mensagem e `code` observados na interface HTTP.
- No Task 1 original, nenhum arquivo de docs, manifesto de smoke ou app foi alterado. O Task 2
  alterou depois apenas a documentação VPS, e o Task 3 verificou o app sem alterar seu código.

### Mutation check

Remover `internalServiceToken` da definição do `task-service` faz o novo teste público falhar nos
proxies regular e especial. Remover autenticação/autorização, antecipar o rate limit, permitir campos
privados, alterar os códigos de erro ou incluir body em observabilidade também quebra os casos
adicionados/reforçados.

## Preocupações e limites

- Graphify não tinha grafo local em `services/graphify-out/graph.json`; a descoberta foi manual e
  limitada às rotas, schemas, services, políticas, proxy, auditoria e testes afetados.
- O harness PostgreSQL opt-in não foi ativado; seus 6 testes aparecem como skips na suíte completa.
- As suítes imprimem logs de erros intencionais dos próprios cenários negativos, mas terminam com
  zero falhas.
- O pnpm emite um warning preexistente sobre `resolutions` em `services/src/package.json`.
- Por restrição da execução original do Task 1, naquela etapa não foram executados testes do app nem
  `smoke:coverage`, e não houve alteração em docs ou manifesto de smoke. Como registrado acima,
  `smoke:coverage`, o smoke do app e a validação final foram executados posteriormente.
- Nenhum push, PR, merge ou deploy foi feito.
