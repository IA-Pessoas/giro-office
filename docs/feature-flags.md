# Feature flags

O Giro Office possui uma camada base de feature flags desacoplada do fornecedor. A primeira etapa
integra o SDK server-side no runtime compartilhado usado pelo gateway e o SDK client-side no app
Next.js. Nenhuma flag de negócio é criada ou consumida nesta etapa.

## LaunchDarkly

LaunchDarkly é o provedor usado para avaliar flags, controlar rollout por ambiente e, em fases
posteriores, apoiar experimentos. O Giro Office mantém contrato e fallback próprios; o restante do
código não deve depender diretamente do SDK.

### Provisionamento do projeto

1. Crie um projeto `Giro Office` na organização do Giro Office.
2. Configure somente os ambientes `development`, `staging` e `production`.
3. Use cada ambiente para validar a mesma flag antes de promovê-la ao próximo estágio. Não use
   `production` para testes locais.
4. Defina responsável técnico e data de revisão para cada flag criada.

Mapeamento de credenciais:

- `development`: `LAUNCHDARKLY_SDK_KEY` no env privado do gateway e
  `NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID` no build/env local do app.
- `staging`: mesmas variáveis, usando credenciais exclusivas do ambiente `staging`.
- `production`: mesmas variáveis, usando credenciais exclusivas do ambiente `production`.

A SDK key server-side é segredo e deve ser armazenada no secret manager ou GitHub Environment
correspondente. O Client-side ID pode aparecer no bundle do navegador, mas não concede permissão
para administrar o projeto. Nunca troque os dois valores, reutilize credenciais entre ambientes ou
registre credenciais em logs.

Para flags futuras avaliadas no navegador, habilite explicitamente a disponibilidade para client-side
SDKs na configuração da flag. Rollouts e experimentos devem ser configurados no LaunchDarkly somente
depois que houver uma flag de negócio aprovada; esta issue não cria experimento A/B.

### Política para flags

- Use chave estável e descritiva, preferencialmente no formato `dominio.capacidade`.
- Descreva objetivo, proprietário, ambientes habilitados, fallback esperado e data de revisão na
  própria flag.
- Comece com rollout restrito em `development`, avance para `staging` e só então avalie `production`.
- Flag temporária precisa de prazo de expiração. Ao expirar, remova consumo no código e a flag no
  LaunchDarkly na mesma mudança de manutenção.
- Não inclua nome, e-mail, permissões, token, cookie ou dados de negócio no contexto.
- Flag controla rollout operacional; autorização e entitlement continuam no backend.

## Configuração local

No env do gateway:

```dotenv
FEATURE_FLAGS_ENABLED=false
LAUNCHDARKLY_SDK_KEY=
LAUNCHDARKLY_INIT_TIMEOUT_MS=3000
```

No env do app:

```dotenv
NEXT_PUBLIC_FEATURE_FLAGS_ENABLED=false
NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID=
NEXT_PUBLIC_LAUNCHDARKLY_INIT_TIMEOUT_MS=3000
```

Para testar uma integração real localmente, use a chave do ambiente `development` em um arquivo
local não versionado, com permissões restritas. O padrão desabilitado é suficiente para testes sem
conta ou rede externa.

## Inicialização e contexto

O gateway inicializa uma única instância no bootstrap do processo e a injeta em `app.locals` para
uso futuro por rotas/services. O app inicializa uma única instância no `FeatureFlagsProvider`,
montado uma vez em `pages/_app.tsx`. Não inicialize SDK em módulo de feature nem dentro de uma
requisição.

O contexto contém somente as chaves estáveis necessárias:

- usuário: `user.id`;
- organização: `user.organization_id`, quando presente.

Não são enviados nome, e-mail, permissões, token, cookie ou dados de negócio. A avaliação de uma
flag é apenas uma decisão operacional de rollout; não substitui autenticação, autorização,
permissões ou entitlements do backend.

## Fallback e operação

Toda consulta recebe um default explícito. Se a integração estiver desabilitada, sem credencial,
falhar ao inicializar, exceder o timeout ou ficar indisponível durante uma avaliação, a camada
retorna esse default de forma determinística. O gateway registra somente o status de inicialização,
sem chave ou contexto.

Use `FEATURE_FLAGS_ENABLED=true` e `LAUNCHDARKLY_SDK_KEY` apenas no env privado do gateway para
`development`, `staging` ou `production`. No deploy VPS, acrescente as variáveis ao secret
`ENV_VPS_GATEWAY` em cada GitHub Environment; o arquivo materializado deve continuar fora do Git e
com modo `600`. Para o frontend, forneça `NEXT_PUBLIC_*` como argumentos/env do build web, sempre
com o Client-side ID do mesmo ambiente e nunca com `LAUNCHDARKLY_SDK_KEY`.

Se o fornecedor estiver indisponível, mantenha o serviço funcionando com os defaults, investigue o
status `unavailable`/`init-error` nos logs e corrija a configuração antes de habilitar flags de
negócio.

## Decisão de camadas

Primeira etapa: contrato compartilhado e no-op, adapter LaunchDarkly server-side inicializado no
gateway e adapter LaunchDarkly client-side inicializado no app. Isso fornece a base de avaliação e
contexto sem alterar fluxos existentes.

Fases posteriores: adicionar flags de negócio aprovadas, decidir caso a caso se a avaliação deve
ocorrer no gateway/backend ou no app e, se necessário, integrar os demais serviços server-side. A
migração de controles operacionais atuais, experimentos específicos e qualquer uso em autorização
permanecem fora desta issue.
