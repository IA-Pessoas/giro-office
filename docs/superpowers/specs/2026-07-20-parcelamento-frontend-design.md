# Parcelamento - Frontend por branches

**Status:** spec frontend-only para branch ponte.
**Branch ponte:** `feature/parcelamento-frontend`.
**Escopo:** substituir a experiencia mockada de `/parcelamento` por um modulo frontend real
consumindo os endpoints existentes do `parcelamento-service` via gateway.

## 1. Contexto confirmado

O backend moderno de parcelamento ja existe em `services/parcelamento-service` e expoe o contrato
publico pelo gateway em `/parcelamento`. O gateway encaminha esse prefixo para
`PARCELAMENTO_SERVICE_URL` e aplica permissao do modulo `parcelamento`.

No frontend, a rota atual `app/src/pages/parcelamento/index.tsx` ainda importa
`app/src/shared/components/newLayout/Parcelamento.tsx`. Esse componente e uma tela grande com dados
locais de certidoes, debitos, parcelamentos e lembretes. Ele nao deve ser usado como base tecnica da
nova implementacao.

O padrao ja usado em migracoes recentes e manter a rota como adaptador fino:

- `Head` com titulo da pagina;
- `canSSRAuth` no `getServerSideProps`;
- import do modulo real por `@modules/<dominio>`;
- teste local garantindo que a pagina nao importa mais `shared/components/newLayout/<TelaLegada>`.

Exemplos de referencia:

- `/regularize` renderiza `RegularizePage` de `@modules/regularize`;
- `/departamento-pessoal` renderiza `PessoalShell` de `@modules/pessoal`;
- `/tecnologia` renderiza `TiPage` de `@modules/ti`;
- `/certificados` renderiza `CertificatesWorkspace` de `@modules/certificates`;
- `/fiscal` renderiza `FiscalShell` de `@modules/fiscal`.

## 2. Objetivo

Criar `app/src/modules/parcelamento` e substituir a tela mockada de `/parcelamento` por uma
experiencia operacional com dados reais.

A implementacao deve:

1. Preservar a rota publica `/parcelamento`.
2. Centralizar endpoints, tipos, payloads, services, hooks e query keys no modulo novo.
3. Usar `useModuleAccess("parcelamento")` para gate de visualizacao e edicao.
4. Reaproveitar o banco de clientes via `useClients` para seletor/filtro de cliente.
5. Entregar um dashboard proprio com dados reais, sem mocks.
6. Entregar fluxos reais de Parcelamentos, Competencias e Panoramas em branches menores.
7. Remover a dependencia da pagina no componente legado `shared/components/newLayout/Parcelamento`.
8. Travar guardrails estaticos para impedir retorno de mock principal ou chamada direta de API em
   componentes.

## 3. Fora do escopo

- Alterar backend, gateway ou contrato HTTP.
- Criar endpoints novos para metricas agregadas de dashboard.
- Reintroduzir as abas mockadas de Certidoes, Debitos e Lembretes sem contrato real.
- Criar dependencias novas de UI, form ou data fetching.
- Implementar delete, porque o backend atual nao expoe endpoint de remocao para esses dominios.
- Resolver drift de contrato no frontend sem registrar a divergencia. Se um endpoint real divergir do
  OpenAPI/backend, a branch deve documentar o problema e manter a correcao em branch propria.

## 4. Estrategia de branches

A branch atual `feature/parcelamento-frontend` e a ponte. Todas as branches filhas nascem dela e
abrem PR de volta para ela. Quando a ponte estiver integrada e validada, ela abre PR para `develop`.

Branches sugeridas:

| Ordem | Branch | Resultado esperado |
| --- | --- | --- |
| 1 | `feat/parcelamento-front-foundation` | Modulo novo, contratos, services, hooks, shell, acesso, seletor de cliente, dashboard real simples e troca da pagina. |
| 2 | `feat/parcelamento-front-installments` | Lista, cria, detalha e edita parcelamentos. |
| 3 | `feat/parcelamento-front-competencies` | Lista, cria e edita competencias por parcelamento. |
| 4 | `feat/parcelamento-front-panoramas` | Lista, cria, detalha, edita e gera panoramas por competencia. |
| 5 | `feat/parcelamento-front-polish` | Ajustes finais, validacao visual, limpeza de mock legado e cobertura de regressao. |

A branch `foundation` deve ser pequena, mas visivel. Ela nao deve entregar todos os CRUDs; deve provar
o encanamento real e substituir a experiencia principal da rota.

## 5. Contrato consumido pelo frontend

O frontend deve consumir somente o contrato publico do gateway:

| Grupo | Metodo | Path | Uso frontend |
| --- | --- | --- | --- |
| Parcelamentos | `GET` | `/parcelamento/installments` | Lista paginada com filtros. |
| Parcelamentos | `POST` | `/parcelamento/installments` | Criar parcelamento. |
| Parcelamentos | `GET` | `/parcelamento/installments/{id}` | Detalhar parcelamento. |
| Parcelamentos | `PATCH` | `/parcelamento/installments/{id}` | Atualizar parcelamento. |
| Competencias | `GET` | `/parcelamento/installments/{installmentId}/competencies` | Listar competencias de um parcelamento. |
| Competencias | `POST` | `/parcelamento/installments/{installmentId}/competencies` | Criar competencia mensal. |
| Competencias | `PATCH` | `/parcelamento/installment-competencies/{id}` | Atualizar competencia. |
| Panoramas | `GET` | `/parcelamento/panoramas` | Lista paginada com filtros. |
| Panoramas | `POST` | `/parcelamento/panoramas` | Criar panorama. |
| Panoramas | `GET` | `/parcelamento/panoramas/{id}` | Detalhar panorama. |
| Panoramas | `PATCH` | `/parcelamento/panoramas/{id}` | Atualizar panorama. |
| Panoramas | `POST` | `/parcelamento/panoramas/competences/{competence}/generate` | Gerar panoramas por competencia. |

`GET /health`, `GET /ready` e `/docs` ficam fora do escopo da UI do modulo.

### 5.1 Paginacao

O backend usa `page` e `page_size`. O helper frontend deve preservar esses nomes no contrato HTTP e
converter para nomes de UI apenas se isso reduzir ruido nos componentes.

Defaults esperados no frontend:

- `page`: `1`;
- `page_size`: `50`;
- maximo de `page_size`: `100`, alinhado ao schema do backend.

### 5.2 Envelope

As respostas de sucesso usam envelope `success/data`. O modulo deve ter helper
`unwrapParcelamentoEnvelope<T>()` e helpers especificos para pagina quando necessario.

Formato de pagina esperado em `data`:

- `items`;
- `total`;
- `page`;
- `page_size`;
- `has_more`.

O frontend pode expor `hasMore` internamente, mas nao deve perder os campos originais em tipos de
contrato.

## 6. Arquitetura frontend

Criar a estrutura:

```text
app/src/modules/parcelamento/
  components/
    ParcelamentoShell.tsx
    ParcelamentoDashboard.tsx
    ParcelamentoClientSelector.tsx
    ParcelamentoStateBox.tsx
    parcelamentoFormControls.ts
  hooks/
    index.ts
    queryKeys.ts
    useParcelamentoInstallments.ts
    useParcelamentoCompetencies.ts
    useParcelamentoPanoramas.ts
  services/
    index.ts
    parcelamentoService.contract.ts
    parcelamentoService.ts
  types/
    index.ts
  utils/
    parcelamentoError.ts
  index.ts
  run-parcelamento-tests.mjs
```

Branches funcionais podem adicionar componentes especificos, como
`ParcelamentoInstallmentsSection.tsx`, `ParcelamentoCompetenciesSection.tsx`,
`ParcelamentoPanoramasSection.tsx` e formularios focados. A `foundation` nao deve criar arquivos
"para depois" sem uso real.

### 6.1 Pagina

`app/src/pages/parcelamento/index.tsx` deve ficar como adaptador fino:

- importar `canSSRAuth` de `@modules/auth`;
- importar `ParcelamentoShell` de `@modules/parcelamento`;
- renderizar `Head` e `<ParcelamentoShell />`;
- nao importar `shared/components/newLayout/Parcelamento`.

### 6.2 Services

Services devem ser o unico lugar do modulo com `api.get`, `api.post` ou `api.patch`.

`parcelamentoService.contract.ts` deve conter:

- `PARCELAMENTO_ENDPOINTS`;
- defaults de paginacao;
- tabs estaveis do modulo;
- helpers de unwrap e pagina;
- builders simples para remover filtros vazios.

`parcelamentoService.ts` deve chamar `api` de `@shared/services/apiClient` e retornar dados ja
normalizados para os hooks.

### 6.3 Hooks e cache

Hooks devem usar React Query via `useFetch` para leituras e `useMutation` para escritas.

Query keys devem partir de `PARCELAMENTO_QUERY_KEY = ["parcelamento"]` e incluir grupo, filtro e id
quando aplicavel.

Mutations devem invalidar a raiz correta:

- criar/editar parcelamento invalida `["parcelamento", "installments"]` e o detalhe alterado;
- criar/editar competencia invalida o grupo de competencias do parcelamento e a lista/detalhe de
  parcelamentos quando impactar contadores;
- criar/editar/gerar panorama invalida `["parcelamento", "panoramas"]`.

## 7. UX esperada

### 7.1 Shell

`ParcelamentoShell` deve seguir a densidade de `PessoalShell`, `FiscalShell` e `ContabilShell`:

- container `mx-auto max-w-[1600px] space-y-6`;
- header com titulo "Parcelamento";
- icone `BadgeDollarSign`, `WalletCards` ou equivalente de `lucide-react`;
- abas compactas com `role="tablist"` e `role="tab"`;
- gate de acesso com `useModuleAccess("parcelamento")`;
- seletor de cliente no header, baseado em `useClients`.

Abas iniciais:

| Aba | Conteudo |
| --- | --- |
| Dashboard | Resumo real simples e atalhos para as outras abas. |
| Parcelamentos | Lista e CRUD de parcelamentos. |
| Competencias | Operacao mensal por parcelamento selecionado. |
| Panoramas | Visao mensal, geracao e edicao de panoramas. |

### 7.2 Dashboard proprio

O dashboard deve usar apenas dados reais dos endpoints atuais. Sem mocks e sem card prometendo metrica
futura.

Na `foundation`, os KPIs podem ser simples e derivados das primeiras paginas:

- total de parcelamentos retornado por `/parcelamento/installments`;
- parcelamentos ativos por `status`;
- parcelamentos em atraso por `overdue_installments_count > 0` ou `status` quando houver status
  equivalente;
- total de panoramas da competencia selecionada;
- progresso agregado simples usando `paid_installments_count`, `agreed_installments_count` e
  `remaining_installments_count` quando os dados existirem.

Se os dados nao permitirem uma metrica confiavel, a metrica nao entra.

### 7.3 Cliente

O seletor de cliente deve reutilizar `useClients` com clientes ativos, seguindo o comportamento de
`PessoalClientSelector`:

- busca por nome, razao social ou CPF/CNPJ;
- paginacao simples;
- opcao de limpar selecao;
- selected client exibido no header;
- filtros das listas usam `client_id` quando houver cliente selecionado.

O componente pode ser copiado/adaptado de forma especifica para Parcelamento. Nao criar seletor
generico compartilhado nesta etapa.

### 7.4 Formularios

Formularios devem respeitar o schema do backend:

- campos obrigatorios aparecem como obrigatorios na UI;
- numeros monetarios usam input numerico simples e conversao para `number`;
- datas usam `<input type="date">`;
- booleans usam checkbox/toggle simples;
- PATCH nao envia payload vazio;
- campos desconhecidos nao sao enviados.

Não usar biblioteca nova de formulario.

### 7.5 Estados

Cada aba deve cobrir:

- carregando;
- erro com mensagem amigavel;
- vazio;
- sucesso;
- permissao negada;
- botao de submit em loading/disabled.

Sem CTA sem acao real. Se uma acao nao estiver pronta naquela branch, ela nao aparece ou fica fora do
escopo da branch.

## 8. Permissoes

O frontend deve usar `useModuleAccess("parcelamento")`.

| Acesso | Comportamento |
| --- | --- |
| Sem visualizacao | Mostrar painel de acesso negado e nao disparar queries de dominio. |
| Pode visualizar | Habilitar dashboard e listas. |
| Pode editar | Habilitar criar/editar/gerar. |

O frontend melhora UX, mas o backend/gateway continuam sendo a barreira real de seguranca.

## 9. Guardrails e testes

Criar `app/src/modules/parcelamento/run-parcelamento-tests.mjs` na `foundation` e adicionar
`test:parcelamento` ao `app/package.json`.

Checks minimos:

1. `PARCELAMENTO_ENDPOINTS` contem exatamente os paths publicos usados pelo gateway.
2. `unwrapParcelamentoEnvelope` extrai `data` e aceita fallback cru.
3. Query keys partem de `["parcelamento"]`.
4. `src/pages/parcelamento/index.tsx` importa `@modules/parcelamento`.
5. `src/pages/parcelamento/index.tsx` nao importa `shared/components/newLayout/Parcelamento`.
6. `ParcelamentoShell.tsx` usa `useModuleAccess("parcelamento")`.
7. `ParcelamentoShell.tsx` nao define arrays mockados principais.
8. Chamadas `api.get`, `api.post` e `api.patch` ficam apenas em `services/parcelamentoService.ts`.
9. `app/package.json` inclui `test:parcelamento`.
10. O script agregado `test` do app inclui `pnpm run test:parcelamento`.

Validacoes por branch:

| Branch | Validacao minima |
| --- | --- |
| `feat/parcelamento-front-foundation` | `pnpm --filter @workspace/app test:parcelamento` e `pnpm --filter @workspace/app typecheck`. |
| `feat/parcelamento-front-installments` | Teste do modulo estendido para endpoints/hooks/guardrails de parcelamentos + typecheck. |
| `feat/parcelamento-front-competencies` | Teste do modulo estendido para competencias + typecheck. |
| `feat/parcelamento-front-panoramas` | Teste do modulo estendido para panoramas/geracao + typecheck. |
| `feat/parcelamento-front-polish` | Teste do modulo, typecheck e smoke manual no navegador. |

Para UI, validar manualmente no navegador quando houver dev server disponivel. Se o ambiente local
estiver sem `node_modules`, registrar a limitacao em vez de declarar validacao executada.

## 10. Regras de implementacao

Toda implementacao deve seguir as regras do workspace:

- antes de alterar `app/**`, tentar Graphify UI (`pnpm graphify:context:ui -- "<task>"`) e usar
  fallback manual com `rg` se o grafo estiver indisponivel;
- aplicar `.codex/rules/frontend-ui-patterns.rules.md` e
  `.codex/rules/frontend-validation.rules.md`;
- manter dados reais como fonte de verdade;
- nao manter mock em fluxo principal;
- usar React Query para estado remoto;
- centralizar endpoints e API calls no service do dominio;
- evitar abstracoes genericas sem repeticao real;
- manter components pequenos conforme a branch exigir, sem refatorar modulos nao relacionados;
- validar com testes/typecheck/smoke escopado antes de declarar uma PR pronta.

## 11. Criterios de aceite

- A spec documenta a branch ponte e as branches filhas.
- A primeira branch substitui a experiencia principal mockada da rota `/parcelamento`.
- Nenhuma branch frontend altera backend sem nova decisao explicita.
- O modulo novo usa `@modules/parcelamento`, `useModuleAccess("parcelamento")`, `useClients`,
  React Query e services centralizados.
- Dashboard, Parcelamentos, Competencias e Panoramas usam apenas dados reais.
- Certidoes, Debitos e Lembretes nao aparecem como abas principais ate existir contrato real para
  eles.
- Cada branch funcional entrega um fluxo usavel e revisavel.
- Guardrails impedem retorno de mock principal e chamadas diretas de API em componentes.

## 12. Proxima etapa

Depois da revisao e aprovacao desta spec, criar o plano de implementacao em:

```text
docs/superpowers/plans/2026-07-20-parcelamento-frontend.md
```

O plano deve comecar pela branch `feat/parcelamento-front-foundation` e quebrar as demais branches em
tasks revisaveis. A implementacao so deve comecar depois do plano aprovado.
