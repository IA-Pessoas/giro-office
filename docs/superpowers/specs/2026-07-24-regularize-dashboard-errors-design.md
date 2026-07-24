# Resiliência e agregação do dashboard do Regularize

**Data:** 2026-07-24

**Issue:** #448

**Status:** aguardando revisão do documento

## Contexto e diagnóstico

Ao abrir `/regularize`, o frontend inicia no dashboard e dispara em paralelo as listagens de
clientes PF, sites, tributos municipais, processos e licenças. Depois dos primeiros resultados,
também pode iniciar consultas vinculadas a abas, como sócios e orientações. O React Query repete
cada falha uma vez, enquanto o interceptor HTTP cria um novo toast genérico para toda resposta
`5xx`.

O histórico de auditoria confirmou dois eventos diferentes:

- Em 2026-07-22, o gateway registrou respostas `502 BAD_GATEWAY` por não conseguir se comunicar
  com o `regularize-service`.
- Em 2026-07-23, cinco listagens responderam `500` em uma mesma abertura da tela. As mesmas rotas
  responderam `200` poucos minutos antes e depois, inclusive após novas tentativas automáticas.

As colunas usadas pelas listagens existem no banco conectado, e a migração
`20260220185848_init_tenancy` está concluída. Portanto, não há evidência atual de coluna ou
migração ausente. O comportamento comprovado é uma falha transitória amplificada pelo fan-out de
requisições, pelo retry e pelo toast por tentativa.

O log final do `regularize-service` inclui usuário, organização e permissão, mas não inclui
explicitamente método, rota e `requestId`. Isso impede correlacionar com segurança um registro do
gateway com a exceção original do serviço.

## Objetivos

- Substituir as cinco listagens iniciais por uma única consulta HTTP de dashboard.
- Transferir o cálculo das métricas para o backend, sempre limitado à organização autenticada.
- Retornar somente os campos necessários para métricas e resumos, sem dados de credenciais.
- Carregar consultas específicas somente quando a aba ou formulário correspondente estiver ativo.
- Preservar uma tentativa automática para erros transitórios sem empilhar toasts.
- Mostrar um único estado de erro contextual no dashboard, com ação de nova tentativa e
  `requestId` quando disponível.
- Incluir rota, método, organização, usuário e `requestId` nos logs de erro do
  `regularize-service`.

## Fora do escopo

- Alterar deploy, DNS, disponibilidade ou dimensionamento do `regularize-service`. Os `502`
  observados são operacionais e precisam de evidência do ambiente para uma correção específica.
- Criar ou executar migração de banco sem uma divergência de schema comprovada.
- Habilitar RLS nas tabelas públicas. A inspeção encontrou tabelas com RLS desabilitado, mas a
  remediação exige desenho de políticas e validação de acesso em uma tarefa de segurança separada.
- Alterar o fluxo de revelação de credenciais coberto pela issue #440.
- Remover ou reestruturar todas as listagens existentes; elas continuarão atendendo às abas.

## Alternativas consideradas

1. **Endpoint agregado para o dashboard, carregamento tardio e erro consolidado.** Reduz o fan-out,
   evita transferir listas completas apenas para calcular contagens e cria um limite claro entre o
   resumo e as telas operacionais.
2. **Somente contenção no frontend.** Adiaria consultas de abas e deduplicaria toasts, mas manteria
   cinco requisições simultâneas e o transporte de dados desnecessários no dashboard.
3. **Somente correção operacional.** Poderia reduzir indisponibilidade do serviço, mas não
   resolveria o fan-out, o carregamento prematuro nem o feedback duplicado.

A primeira alternativa foi aprovada.

## Contrato do dashboard

O `regularize-service` exporá:

```http
GET /regularize/dashboard?year=2026
```

`year` será obrigatório e convertido para inteiro com a mesma regra da listagem atual de tributos
municipais. A rota continuará protegida pela autenticação do serviço e obterá a organização
exclusivamente do contexto encaminhado pelo gateway.

A resposta seguirá o envelope padrão `{ success: true, data }`:

```ts
interface RegularizeDashboard {
  year: number;
  metrics: {
    openProcesses: number;
    activeLicenses: number;
    activeClientPfs: number;
    activeSites: number;
    municipalTaxesCompleted: number;
    municipalTaxesPending: number;
    municipalTaxesTotal: number;
  };
  recentProcesses: Array<{
    id: string;
    process_type: string;
    cpf_cnpj: string;
    status: string;
    clientPF: { name: string; cpf: string } | null;
    clientPJ: { name: string; cpf_cnpj: string } | null;
  }>;
  trackedLicenses: Array<{
    id: string;
    type_license: string;
    protocol: string;
    due_date: string | null;
  }>;
}
```

Nenhum campo de login, senha, anotação de credencial ou detalhe não exibido pelo dashboard fará
parte desse contrato.

## Backend

Um `RegularizeDashboardService` concentrará a agregação. Ele executará uma transação de leitura
com consultas explícitas para:

- contar processos ainda não concluídos, cancelados ou encerrados;
- obter até seis processos recentes com somente os dados exibidos;
- contar licenças com status `Ativo`;
- obter até seis licenças ativas para acompanhamento;
- contar clientes PF com status `Ativo`;
- contar sites ativos;
- contar clientes PJ ativos e quantos possuem tributo municipal no ano solicitado.

Todas as consultas, inclusive relações aninhadas, incluirão `organization_id`. A quantidade de
tributos pendentes será `max(total - completed, 0)`.

O serviço não reutilizará as listagens completas apenas para obter contagens. A transação de leitura
limita o trabalho a um único fluxo de agregação e evita que o browser coordene várias operações
independentes.

A nova rota terá schema Zod, documentação OpenAPI e teste de autenticação como as demais rotas do
módulo.

O contexto do error handler do `regularize-service` passará a registrar:

- `requestId`;
- método e rota requisitada;
- `userId`;
- `organizationId`;
- permissão encaminhada.

O corpo público continuará retornando a mensagem segura padrão e o `requestId`, sem expor stack,
SQL ou conteúdo sensível.

## Frontend e fluxo de dados

Será criado um contrato de frontend, um método `regularizeService.getDashboard(year)` e o hook
`useRegularizeDashboard(year)`. A chave de cache ficará sob
`["regularize", "dashboard", year]`.

Enquanto `activeTab === "dashboard"`, apenas o hook agregado será habilitado entre as consultas do
Regularize. Os cards e as duas seções usarão diretamente `metrics`, `recentProcesses` e
`trackedLicenses`.

As listagens existentes serão habilitadas conforme seu consumo:

- processos: aba de processos e formulários que dependam de processos;
- licenças: aba de licenças;
- clientes PF: abas ou formulários de PF, sócios e processos;
- sites: aba de sites e formulário de senha;
- tributos: aba de tributos;
- sócios, senhas e orientações: somente após existir seleção válida no contexto da aba ou
  formulário correspondente.

O botão de atualização atualizará somente a consulta da aba ativa. Ele não chamará `refetch()` em
queries desabilitadas.

Mutações que alterem uma métrica invalidarão também a chave do dashboard, além das chaves de lista
já invalidadas. Isso evita métricas obsoletas ao retornar para a aba inicial.

## Estados de carregamento e erro

Durante a primeira carga, os cards não exibirão zero como se fosse um valor confirmado. O
dashboard apresentará seu estado de carregamento.

Se a consulta agregada falhar:

- haverá um único painel de erro para o dashboard;
- o painel explicará que o resumo do Regularize não pôde ser carregado;
- haverá uma ação explícita de nova tentativa;
- o `requestId` da resposta será mostrado quando existir, para suporte e correlação de logs;
- métricas e listas não serão apresentadas como vazias.

O retry global de uma tentativa será preservado para falhas transitórias. O toast genérico de
servidor receberá um identificador estável enquanto estiver visível, fazendo com que respostas
simultâneas ou retry da mesma janela resultem em uma única notificação. O painel contextual será a
fonte principal de orientação dentro da tela.

Erros das abas continuarão isolados no `QueryStatePanel` da própria lista e não invalidarão dados
de outras abas.

## Segurança e isolamento

- A organização nunca será aceita por query string ou body.
- Toda contagem e seleção será filtrada pelo `organization_id` autenticado.
- O endpoint não retornará segredos nem listas completas de credenciais.
- Mensagens públicas não conterão detalhes do banco.
- O `requestId` será apenas um identificador de correlação.

## Estratégia de testes

A implementação seguirá TDD.

### Serviço

- agrega métricas com os status definidos;
- limita e ordena processos e licenças recentes;
- inclui `organization_id` em todas as consultas;
- calcula tributos pendentes sem valor negativo;
- não seleciona campos sensíveis de sites ou senhas;
- propaga falhas para o error handler sem converter erro em dados vazios.

### Rota e contrato

- exige autenticação;
- valida `year`;
- retorna o envelope esperado;
- preserva `requestId` em respostas de erro;
- aparece no OpenAPI e no contrato agregado do gateway.

### Frontend

- chama apenas `/regularize/dashboard` na abertura da aba inicial;
- não habilita sócios, senhas ou orientações no dashboard;
- habilita cada listagem ao entrar na aba correspondente;
- usa os valores agregados sem recalcular a partir das listas;
- mostra estado único de erro, nova tentativa e `requestId`;
- atualiza somente a aba ativa;
- invalida o dashboard depois de mutações que alteram métricas.

### Toast

- duas respostas `5xx` enquanto o toast estiver ativo produzem uma única notificação;
- uma nova falha pode ser notificada depois que o toast anterior deixar de estar ativo;
- respostas que não sejam `5xx` não acionam esse fluxo.

## Validação

- testes do `regularize-service`;
- testes de contrato do Regularize no frontend;
- regressão de abertura do dashboard e deduplicação de toast;
- typecheck escopado do app e do serviço;
- lint escopado quando suportado pelos pacotes;
- inspeção do diff e busca de call sites para confirmar que queries desabilitadas não são
  reativadas pelo botão de atualização.

O Graphify está indisponível porque os grafos locais do app e dos serviços não existem neste
worktree. A revisão estrutural será feita por diff, busca de call sites e validações escopadas.

## Critérios de aceite

- Abrir `/regularize` dispara uma única consulta de dados do Regularize para o dashboard.
- O dashboard não carrega antecipadamente sócios, senhas ou orientações.
- Nenhuma credencial é retornada pelo endpoint agregado.
- Uma falha do dashboard gera um único toast e um único estado contextual acionável.
- O usuário consegue copiar ou informar o `requestId` exibido.
- As abas carregam seus dados quando ativadas e mantêm estados de erro independentes.
- Logs do `regularize-service` permitem correlacionar a exceção usando `requestId`, método e rota.
- Testes automatizados protegem o fan-out, o isolamento por organização e a deduplicação.
