# Acesso ao PA do cliente — investigação #1596

## Referências e limite da comparação

- Workspace: checkout histórico do repositório `iapessoastecnologia/workspace`, commit [`c948a0c7`](https://github.com/IA-Pessoas/giro-office/tree/c948a0c7ff6e8d4bbd2414a9853ec90d3e7c09c7), de 05/08/2026. O endereço remoto antigo hoje redireciona para `IA-Pessoas/giro-office`. Esta é uma comparação de código, não uma validação do deployment atual do Workspace.
- Office: branch `feature/milestone-12-issues-1592-1596` no commit `6ec314d7`, de 06/10/2026.
- O relato da área não informa perfil, nível, organização, cliente nem operação que apresentou a divergência. Esses dados foram solicitados sem pedir informação pessoal. Não havia sessão de teste da área para repetir o relato em ambiente real.

## Operações observadas

| Operação | Workspace histórico | Office | Condição observada |
| --- | --- | --- | --- |
| Abrir a página `/clients/{id}/pa` | Disponível | Disponível | `canSSRAuth` exige cookie de sessão. O `AppShell` associa a rota ao módulo `pessoal` e exige visualização (nível 1–3 ou proprietário). O cartão “PA” no detalhe do cliente não tem condição própria de nível. |
| Consultar `GET /client/{id}/pa` | Disponível | Disponível | Gateway exige autenticação e nível ≥1 em Comercial, Contábil, Financeiro ou Fiscal (ou proprietário). Client-service valida o contexto encaminhado e limita cliente/PA à organização autenticada. |
| Criar `POST /client/{id}/pa` | Disponível | Disponível | Gateway exige nível ≥2 em Comercial, Contábil, Financeiro, Fiscal, Pessoal ou Regularize (ou proprietário). Serviço requer cliente existente na organização e rejeita PA duplicado. |
| Alterar `PATCH /client/{id}/pa` | Disponível | Disponível | Mesma política de escrita do gateway; serviço requer PA existente na organização antes de atualizar. |
| Excluir PA | Não localizada | Não localizada | Não há rota de exclusão de PA no fluxo comparado. |

Fontes: [página PA](../../app/src/pages/clients/%5Bid%5D/pa.tsx), [AppShell](../../app/src/shared/components/newLayout/AppShell.tsx), [cartão do cliente](../../app/src/pages/clients/%5Bid%5D.tsx), [políticas do gateway](../../services/gateway/src/security/policies.ts), [registro de serviços](../../services/gateway/src/config/serviceRegistry.ts), [rotas PA](../../services/client-service/src/routes/clientPa.routes.ts), [autenticação do client-service](../../services/client-service/src/middlewares/isAuthenticated.ts) e [consultas do PA](../../services/client-service/src/services/clientPaService.ts). Os mesmos caminhos foram examinados no commit histórico do Workspace.

## Níveis e fronteiras de autorização

Nos dois snapshots, a interface associa `/clients/{id}/pa` a `pessoal`. O `AppShell` nega a tela ao nível 0 e permite a visualização a partir do nível 1. O formulário não distingue `canView` de `canEdit`: usuários que chegam à tela com nível 1 veem os controles de edição, ainda que o gateway possa negar a operação.

O gateway registra `/client` sem `permissionModule` no catálogo, mas **aplica políticas por caminho**. `GET /client/{id}` e `GET /client/{id}/pa` exigem nível ≥1 em Comercial, Contábil, Financeiro ou Fiscal. `POST/PATCH /client/{id}/pa` exigem nível ≥2 em um desses módulos, Pessoal ou Regularize. O nível global não substitui a permissão modular; proprietário é a exceção explícita. As rotas do client-service usam `isAuthenticated` sem verificar nível e limitam cliente/PA pelo `organization_id` do contexto recebido. Por isso, testes diretos do serviço mostram uma camada interna mais permissiva que a rota pública, mas **não demonstram acesso público sem autorização no gateway**.

Há desalinhamentos nos dois produtos: Pessoal 1 isolado abre a tela, mas o gateway nega as consultas necessárias; Pessoal 2 isolado pode escrever pela API, mas não consultar o PA; um usuário com Pessoal 0 e Comercial 2 não abre a tela, mas pode ler e escrever PA diretamente pela API. Esse último caso pode expor dados do dossiê a um perfil sem acesso à tela; a regra de negócio para PA ainda não foi fornecida. Nenhuma autorização entre organizações foi observada.

## Reproduções com identificadores sintéticos

Os testes em [políticas do gateway](../../services/gateway/src/test/modulePermissionRegression.test.ts) e [rotas do client-service](../../services/client-service/src/test/client.routes.test.ts) cobrem:

| Perfil / organização / operação | Resultado esperado e observado |
| --- | --- |
| Gateway: Pessoal 0 ou 1 isolado; GET/POST/PATCH de PA | Todas as operações negadas. |
| Gateway: Pessoal 2 isolado; GET/POST/PATCH de PA | GET negado; POST/PATCH permitidos pela política. |
| Gateway: Comercial 1 e Pessoal 1; GET/POST/PATCH de PA | GET permitido; POST/PATCH negados. |
| Gateway: Comercial 1 e Pessoal 2; GET/POST/PATCH de PA | Todas permitidas pela política. |
| Gateway: Comercial 2 e Pessoal 0; GET/POST/PATCH de PA | Todas permitidas pela política, embora a tela negue Pessoal 0. |
| Client-service isolado: níveis globais 0–3 com Pessoal 0 ou Pessoal 1, mesma organização | GET 200, POST 201, PATCH 200. Esse teste caracteriza somente o serviço após o gateway. |
| Client-service sem autenticação; as três operações | 401; nenhuma consulta ao cliente. |
| Client-service com sessão da organização A e cliente da organização B; as três operações | 404; nenhuma criação ou alteração. |
| Navegador sem sessão; abrir `/clients/{id}/pa` | Redireciona para `/login`. |
| Navegador com Pessoal 0 e Integração 1; abrir `/clients/{id}/pa` | `AppShell` mostra “Acesso indisponível”. |
| Navegador com Pessoal 1 e Integração 1; abrir `/clients/{id}/pa` | A tela abre, mas a simulação da resposta 403 do gateway mostra erro ao carregar o cliente. |
| Navegador com Pessoal 1, Comercial 1 e Integração 1; abrir `/clients/{id}/pa` | A tela apresenta o PA e os controles de edição. Pela política do gateway, uma tentativa de escrita desse perfil receberia 403. |

A reprodução de navegador usa [dados sintéticos e respostas de API simuladas](../../app/src/modules/clients/run-client-pa-access-browser-smoke.mjs), sem depender de cliente real. Ela demonstra o comportamento da tela para respostas coerentes com a política testada; não é um teste integrado do gateway. Para repetir, compile o app com `corepack pnpm --filter @workspace/app build`, inicie com `corepack pnpm --filter @workspace/app exec next start -p 3117` e execute `corepack pnpm --filter @workspace/app test:client-pa-access-browser`. A URL pode ser trocada por `PA_ACCESS_SMOKE_BASE_URL`. Capturas: [sem sessão](../../output/playwright/issue-1596/pa-sem-sessao.png), [Pessoal 0 negado](../../output/playwright/issue-1596/pa-pessoal-0-negado.png), [Pessoal 1 com API negada](../../output/playwright/issue-1596/pa-pessoal-1-api-negada.png) e [Pessoal 1 com Comercial 1](../../output/playwright/issue-1596/pa-pessoal-1-comercial-1.png).

O caso original da área **não pôde ser reproduzido** porque faltam o perfil/nível, a organização e cliente de teste, a operação e o resultado esperado/recebido. A execução real no Workspace atual também não foi verificada. Nenhum dado pessoal foi coletado ou incluído.

## Resultado e decisões pendentes

Não foi confirmada diferença de autorização de PA entre o snapshot do Workspace e o Office. Nenhuma regra de acesso foi alterada. As negações por falta de autenticação, por política modular e por outra organização foram fixadas como regressão; o acesso permitido pelas políticas atuais continua funcional. **Foi confirmado um desalinhamento entre tela e gateway nos dois produtos:** Pessoal 1 isolado não consegue ler, e um perfil com Pessoal 0 mais outro módulo autorizado pode acessar PA pela API. A decisão sobre a regra de PA e eventual correção permanecem pendentes da área responsável.

Para decidir se o relato exige mudança, a área responsável precisa informar: (1) operação exata; (2) perfil e níveis global/modulares; (3) organização e cliente de teste; (4) resposta observada em cada produto; (5) resposta esperada e regra que a sustenta. Em especial, deve confirmar quais módulos podem ler PA, se Pessoal 0 pode acessar o dossiê por outro módulo e se os controles de edição devem aparecer para nível 1. Qualquer ajuste depende dessa definição e da comparação com o Workspace vigente.

Fora desta investigação: permissões do dossiê de RH e de outros módulos.
