# Relações entre campos em relatórios (#1271)

## Inventário atual

- O catálogo publica capacidades por campo (`selectable`, `filterable`, `sortable`,
  `groupable`, `aggregations`) e a autorização filtra fontes e campos antes da execução.
- A composição `version: 2` guarda `fields`, `groupBy`, `aggregations` e `orderBy` por
  área. O contrato anterior guarda `columns`, `group_by` e `aggregations` separadamente.
- Na prévia e na execução, a presença de agrupamento ou agregação substitui a lista de
  colunas de `fields` pelas chaves de `groupBy` e pelos aliases das agregações. Assim,
  `fields` não controla a projeção visível do resumo. Os adaptadores executam critérios
  e agregações na origem, antes do limite da prévia.
- A execução persiste blocos e linhas de snapshot; histórico aponta para versão do
  modelo e snapshot. CSV, XLSX e PDF exportam as colunas persistidas no bloco.
- A interface permite marcar campos, agrupamentos, resumos e ordem, mas não expressa
  se o resultado deve listar detalhes por grupo ou resumir grupos, nem ocultar uma
  medida da apresentação.

## Alternativas e decisão proposta

| Alternativa | Resultado | Limite |
| --- | --- | --- |
| Reinterpretar `fields` da versão 2 | Menor mudança de esquema | Altera relatórios legados e continua ambígua entre lista e resumo. |
| Uma lista de colunas com papéis opcionais | Contrato curto | Um campo usado em mais de um papel ou oculto exigiria exceções e inferências. |
| Nova versão com operações e apresentação separadas | Papéis explícitos e compatibilidade | Exige migração do editor, serviço e adaptadores por área. |

**Proposta:** introduzir uma composição `version: 3`, com uma operação por área e
uma apresentação ordenada. `dimensions`, `details`, `measures`, `filters` e `orderBy`
descrevem a consulta; `display.columns` descreve apenas colunas visíveis. A área
tem `layout: "grouped_list" | "summary"`. Uma referência de campo pode atuar em
mais de um papel, desde que cada uso tenha a capacidade exigida no catálogo.
Filtros, dimensões, medidas e ordenação podem referenciar campos não projetados.
A autorização valida **todas** as referências antes de consultar a origem e de
salvar o modelo. Campo não projetado continua sujeito às mesmas permissões.

Na primeira entrega, cada operação usa **uma única área**. Uma composição pode
conter várias áreas independentes, gerando blocos separados. Relações cruzadas,
joins e uma área principal não são parte deste contrato. O suporte anterior a
joins permanece no contrato legado, sem ser inferido na versão 3.

### Contrato observável proposto

Os exemplos abaixo usam um catálogo ilustrativo de empresas. As chaves reais devem
ser as chaves publicadas pela área escolhida; nenhuma fonte nova é presumida.

```json
{
  "version": 3,
  "areas": [{
    "source": "empresas",
    "layout": "grouped_list",
    "dimensions": ["estado"],
    "details": ["nome"],
    "measures": [],
    "filters": [],
    "orderBy": [{"field": "estado", "direction": "asc"}, {"field": "nome", "direction": "asc"}],
    "display": {"columns": ["nome"], "groupHeadings": true}
  }]
}
```

Entrada ilustrativa: `SP/Ana Ltda`, `RJ/Beta SA`, `SP/Ana Ltda`. Saída:
bloco `RJ`, linha `Beta SA`; bloco `SP`, duas linhas `Ana Ltda`. O estado organiza
as seções e não vira coluna. Nomes repetidos permanecem, pois representam
registros distintos. O cabeçalho de seção é parte da apresentação, mesmo quando
o campo não aparece como coluna.

```json
{
  "version": 3,
  "areas": [{
    "source": "empresas",
    "layout": "summary",
    "dimensions": ["estado"],
    "details": [],
    "measures": [{"key": "total_empresas", "function": "count_rows"}],
    "filters": [],
    "orderBy": [{"measure": "total_empresas", "direction": "desc"}],
    "display": {"columns": ["estado"]}
  }]
}
```

Entrada ilustrativa: duas empresas em `SP` e uma em `RJ`. O resultado de consulta
contém `[{estado:"SP",total_empresas:2},{estado:"RJ",total_empresas:1}]`, nessa
ordem. A tabela e as exportações exibem apenas `Estado`; a contagem permanece no
resultado autorizado para orientar a ordenação e, se configurado, um gráfico.
Para mostrar a contagem, adicione `total_empresas` a `display.columns`. A UI deve
explicar que duas linhas `SP` podem parecer iguais quando a dimensão for ocultada.

### Regras e limites

- `grouped_list` requer ao menos uma dimensão e um detalhe visível; cada linha de
  origem continua uma linha de detalhe. `summary` requer dimensão e medida; cada
  combinação de dimensão gera uma linha. Sem dimensão, só uma medida global é
  permitida e somente se a origem anunciar essa capacidade.
- `count_rows` conta registros autorizados após filtros, inclusive registros com
  `nome` nulo. `count(field)` conta apenas valores não nulos, se a origem o suportar.
  Soma, média, mínimo e máximo seguem as capacidades anunciadas pelo campo.
- `null` e campo ausente compõem o grupo `Sem valor`; string vazia é valor distinto.
  Grupos vazios não são gerados. Nomes repetidos não são deduplicados.
- A ordem padrão é dimensão ascendente, valores nulos por último, depois detalhes
  ou medidas explicitamente escolhidos. Empates preservam a ordem estável da
  origem; adaptadores sem chave estável devem declarar a limitação e não prometer
  ordem reprodutível entre execuções. Ordenar por medida oculta é permitido.
- Uma capacidade ausente, um campo revogado ou uma combinação não suportada gera
  erro de validação antes da consulta, sem degradar silenciosamente para outra
  apresentação. A UI mantém a configuração editável e explica o campo ou papel
  incompatível. Limites de linhas e bytes continuam aplicados na origem, antes
  do corte da prévia; uma contagem total nunca é calculada só sobre a página.
- A versão 2 e o contrato anterior preservam seus resultados atuais. Modelos
  antigos só passam à versão 3 por edição explícita, com prévia comparativa; a
  leitura do histórico usa a versão e a apresentação persistidas no snapshot.

## Fluxo mínimo e camadas afetadas

1. Escolher a área e os campos permitidos; escolher `Listar por grupo` ou
   `Resumir por grupo`.
2. Escolher dimensão, detalhes ou medida, ordem e colunas visíveis. O editor
   indica quando um campo organiza a saída sem aparecer como coluna.
3. Validar capacidade e autorização no catálogo e no `reports-service`; mostrar
   erro específico para papel incompatível, campo revogado ou opção não suportada.
4. Prévia e execução recebem a mesma definição versionada. Adaptadores/origens
   aplicam filtro, agrupamento e contagem antes do limite; o serviço projeta
   apenas as colunas visíveis na tabela/exportação e persiste, de forma separada,
   os valores autorizados necessários para ordenação ou gráficos.
5. Modelo, versão, job, snapshot, histórico e exportação conservam a definição
   e a apresentação usadas na execução. CSV, XLSX e PDF exportam a projeção
   visível do snapshot; gráficos usam apenas seus valores autorizados, conforme
   #1273. OpenAPI, contratos compartilhados e smoke precisam refletir a versão 3.

## Verificação e divisão

Testes de contrato devem rejeitar campos/capacidades ausentes ou revogados e
aceitar campos ocultos autorizados. Testes de serviço devem observar as duas
entradas acima por prévia e snapshot, incluindo nulos, repetidos, ordem,
limite antes/depois de agregação e modelo legado. Testes de interface devem
validar a configuração, mensagens de incompatibilidade e equivalência entre
prévia, tabela e exportação. A interface pública de cada teste deve ser rota,
resultado ou componente visível, sem inspecionar helpers internos.

A execução é grande: contrato/serviço/adaptadores e editor/resultado precisam
de issues derivadas independentes, ambas bloqueadas pela aprovação desta
decisão. #1273 usa o resultado dessas entregas; seu gráfico não altera a
consulta nem entra nos arquivos PDF, XLSX ou CSV nesta primeira versão.

## Decisão e desdobramento

Proposta aprovada pelo usuário em 25/09/2026. Implementação desdobrada nas issues
#1513 (contrato e execução) e #1514 (editor e apresentação), vinculadas como
subissues de #1271. A interface publica a versão 3 por área, mantém leitura e
edição dos modelos versão 2, e exige ao menos um detalhe visível na lista agrupada.

Na lista agrupada, as dimensões também precisam anunciar ordenação no catálogo, pois formam
um prefixo obrigatório da ordem enviada à origem para manter grupos contíguos. Detalhes
podem ser exibidos sem capacidade de ordenação; somente detalhes explicitamente
ordenados precisam dessa capacidade. A exportação inclui dimensões ocultas como colunas
`Grupo: ...` para conservar o cabeçalho de grupo nos formatos tabulares.
