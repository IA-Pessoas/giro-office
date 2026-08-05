# Migração V4 — Mapeamento integral do legado

## Contexto

O sistema legado da Castelo Contabilidade é mono-tenant. O backup mais recente está em
`/home/bruno/Documents/03.08.2026` e contém 312 dumps SQL, com os mesmos nomes de arquivos dos
backups de `06.07.2026` e `10.07.2026`.

O comportamento do sistema legado está preservado em `/home/bruno/Documents/workspace2`. Esse
código PHP é fonte obrigatória para compreender CRUD, relações, cardinalidades, valores derivados
e diferenças semânticas entre os dois sistemas.

As migrações anteriores cobriram conjuntos específicos na V2, na V3 e nos fluxos posteriores de
RH/Departamento Pessoal, Tecnologia, Certificados e Parcelamento. A V4 deve revisar todo o backup,
sem limitar o inventário aos domínios anteriormente migrados.

Tenant de destino:

- organização: Castelo Contabilidade;
- `organization_id`: `e8048d1c-0830-45d7-84de-68e20abd685b`.

## Objetivo

Criar um pacote V4 autocontido que inventarie e classifique as 312 tabelas do backup, comprove o
comportamento de cada origem no sistema legado, modele as adaptações necessárias para os contratos
existentes do sistema atual, produza mapeamentos auditáveis e execute um preflight somente leitura
contra o Supabase atual.

Esta primeira entrega não limpa nem grava dados no Supabase e não cria o script de aplicação final.

## Decisões aprovadas

- Mapear as 312 tabelas, sem limitação por módulo.
- Revisar semanticamente cada tabela contra o código em `/home/bruno/Documents/workspace2`.
- Aplicar, em caso de divergência, a seguinte prioridade: comportamento comprovado no código
  legado; contrato real do sistema atual; metadados e vínculos explícitos do backup; migrações
  anteriores apenas como referência.
- Não propor novas tabelas, schemas, serviços ou contratos.
- Tabelas sem destino confirmado devem ficar em `pending-mapping` com motivo objetivo.
- Registros incompatíveis, ambíguos ou inválidos devem ficar em quarentena rastreável.
- O preflight deve consultar o Supabase em transação `READ ONLY`.
- Todos os arquivos da V4, inclusive scripts atuais e futuros, devem ficar em
  `docs/migration/v4/`.
- Senhas e segredos nunca podem aparecer em claro em CSV, JSON, relatórios ou logs.
- A futura migração será um recarregamento integral do tenant Castelo.
- A limpeza futura removerá todos os dados operacionais da Castelo, inclusive registros criados
  diretamente no sistema novo, preservando somente o cadastro da organização.
- A limpeza e a carga só poderão acontecer após todas as tabelas estarem classificadas, todas as
  quarentenas terem decisão registrada e uma nova autorização explícita.

## Não objetivos desta entrega

- Alterar o schema Prisma ou o schema real do Supabase.
- Criar tabelas ou serviços para acomodar dados sem destino atual.
- Limpar dados das cargas anteriores.
- Executar inserts, updates, deletes, truncates ou migrations no Supabase.
- Criar ou executar o script final de limpeza e aplicação.
- Resolver automaticamente decisões de negócio pendentes.
- Confirmar uma regra somente porque ela existia na V2, V3 ou em um script posterior.

## Estrutura do pacote

```text
docs/migration/v4/
├── README.md
├── manifest.json
├── mapping/
│   ├── tables.csv
│   ├── tables.json
│   ├── columns.csv
│   └── columns.json
├── pending-mapping/
│   ├── tables.csv
│   └── tables.json
├── quarantine/
│   ├── summary.json
│   └── reasons.csv
├── reports/
│   ├── source-inventory.json
│   ├── legacy-behavior-analysis.json
│   ├── legacy-behavior-analysis.md
│   ├── semantic-decisions.json
│   ├── previous-mapping-comparison.json
│   └── supabase-preflight.json
└── scripts/
    ├── inventory.mjs
    ├── analyze-legacy.mjs
    ├── build-mapping.mjs
    └── preflight.mjs
```

Arquivos intermediários volumosos, dados brutos, credenciais e valores secretos não serão
versionados. Os dumps continuam fora do repositório.

## Arquitetura

### 1. Inventário da origem

`docs/migration/v4/scripts/inventory.mjs` lê somente arquivos `.sql` de um diretório informado
explicitamente. O
script extrai:

- identificador técnico `sourceTable` igual ao nome completo do arquivo sem `.sql`, preservando
  todos os segmentos separados por ponto;
- colunas presentes nos comandos `INSERT`;
- quantidade de registros;
- presença e tipo aparente da chave legada;
- tamanho e hash SHA-256 do arquivo;
- indicadores de campos sensíveis, sem copiar seus valores.

O inventário deve falhar se o diretório não existir, se houver nomes duplicados, se um dump não
puder ser analisado ou se a quantidade de tabelas for diferente da esperada pelo manifesto da
execução.

### 2. Evidência semântica do legado

`docs/migration/v4/scripts/analyze-legacy.mjs` cruza os 312 stems do inventário com o código PHP
legado, ignorando dependências, uploads e binários. Para cada origem, o relatório registra:

- módulo e papel funcional;
- arquivos e linhas que leem, criam, alteram ou excluem dados;
- relações, joins, helpers dinâmicos e cardinalidades observadas;
- colunas e contagem do dump, sem valores de linha;
- contratos existentes candidatos no Prisma e nos serviços atuais;
- necessidade de adaptação, confiança e incertezas.

A auditoria global é uma triagem de evidências, não uma confirmação automática. Cada domínio passa
por revisão semântica aprofundada antes de uma regra se tornar `confirmed`. Referências dinâmicas
e casos sem contrato atual permanecem explícitos em `pending-mapping`.

A linha de base auditada contém 312 origens: 61 com candidato direto, 74 com candidato adaptado,
113 sem destino confirmado, 56 auxiliares ou históricas e 8 sem referência de código localizada.
Essas classes orientam a revisão, mas não substituem `confirmed` ou `pending`.
`reports/semantic-decisions.json` registra decisões aprofundadas que confirmem ou corrijam a
triagem global, sempre com a evidência que motivou a mudança.

### 3. Catálogo central e grafo de transformações

`docs/migration/v4/scripts/build-mapping.mjs` combina quatro fontes:

1. inventário do backup de `03.08.2026`;
2. comportamento comprovado em `/home/bruno/Documents/workspace2`;
3. contratos reais do Prisma e dos serviços atuais;
4. artefatos V2/V3 e scripts posteriores, usados somente como evidência histórica.

O catálogo é central, mas as regras são organizadas por domínio dentro do código para evitar um
fluxo monolítico. Toda tabela de origem recebe exatamente uma entrada.

Uma origem confirmada contém um ou mais passos de destino quando a mudança entre os sistemas assim
exigir. Os modos permitidos são:

- `insert`: cria uma entidade correspondente;
- `merge`: complementa uma identidade criada por outra origem;
- `lookup`: resolve uma referência ou catálogo existente;
- `derived`: emite linha necessária por mudança comprovada de modelo;
- `aggregate`: agrupa linhas-filhas em JSON ou estrutura do registro pai.

O número de destinos nunca é decidido isoladamente. Cada passo existe somente quando o
comportamento legado e o contrato atual comprovam a adaptação.

### 4. Preflight do destino

`docs/migration/v4/scripts/preflight.mjs` consulta o Supabase atual somente em transação
`READ ONLY`. O preflight
valida:

- existência das tabelas e colunas de destino;
- nulabilidade, tipos, índices únicos e chaves estrangeiras;
- distribuição atual por tenant;
- contagens atuais do tenant Castelo;
- IDs determinísticos já presentes;
- conflitos entre a nova carga preparada e dados existentes;
- diferenças entre `schema.prisma` e o catálogo real do PostgreSQL;
- prontidão das configurações de criptografia necessárias;
- dependências para a futura ordem de limpeza e carga.

O resultado contém `readyForMigration: true` somente quando todos os bloqueios técnicos e de
negócio tiverem sido resolvidos. Nesta primeira execução, pendências são esperadas e devem resultar
em `readyForMigration: false`, sem tratar isso como falha do gerador.

## Modelo de classificação

### Classificação de tabelas

- `confirmed`: existe destino compatível no sistema atual e o contrato foi validado.
- `pending`: não existe destino confirmado, existe ambiguidade ou o contrato atual não preserva os
  dados.

Não existe classificação que autorize criar destino novo automaticamente.

### Classificação de registros

- `prepared`: registro compatível com a regra confirmada e apto para a futura carga.
- `quarantine`: registro que exige correção ou decisão antes da carga.

Uma tabela `confirmed` pode possuir registros em quarentena. Uma tabela `pending` não produz carga
preparada enquanto sua decisão não for registrada.

Classificações de auditoria como auxiliar, histórica ou sem referência de código não substituem o
estado final. Sem destino atual confirmado ou agregação comprovada, a tabela permanece `pending`.

## Contrato de transformação

Cada regra possui uma única `sourceTable`, evidências auditáveis e uma lista ordenada de
`destinations`. Uma regra 1:1 é apenas o caso simples de uma lista com um passo `insert`.

Cada passo de destino registra:

- tabela de destino existente;
- modo `insert`, `merge`, `lookup`, `derived` ou `aggregate`;
- identidade própria ou referência à identidade produzida por outra origem;
- mapeamentos de coluna;
- constantes e defaults;
- precedência entre fontes;
- dependências;
- condições de emissão e quarentena.

`classifySourceRow` valida a linha da origem. `emitRows` é puro e determinístico e pode produzir
zero, uma ou várias emissões por destino. Um erro em uma emissão não bloqueia outras emissões
independentes da mesma linha.

As contagens são registradas por origem e destino:

- lidas;
- inseridas;
- mescladas;
- derivadas;
- agregadas;
- não emitidas com justificativa;
- colocadas em quarentena.

### Campos do mapeamento de tabela

- tabela de origem;
- quantidade de registros na origem;
- passos e tabelas de destino, quando confirmados;
- estado `confirmed` ou `pending`;
- motivo do estado;
- domínio funcional;
- origem da regra: V2, V3, fluxo posterior ou validação V4;
- estratégia de identidade ou merge por passo;
- dependências de carga;
- totais por tipo de emissão e em quarentena.

### Campos do mapeamento de coluna

- tabela e coluna de origem;
- tabela e coluna de destino;
- passo de destino e modo de adaptação;
- transformação;
- tratamento de nulos e obrigatoriedade;
- papel na identidade ou referência;
- classificação de sensibilidade;
- origem da regra;
- observação objetiva quando a coluna não for preservada.

## Identidade e reconciliação

A identidade técnica padrão continua baseada em `sourceTable integral + id legado`. Um passo
`merge` pode resolver explicitamente uma identidade criada por outra origem, usando o vínculo
legado comprovado. Campos naturais como nome, CPF, CNPJ, e-mail, login e RG auxiliam a conferência,
mas não substituem uma chave explícita nem autorizam merge ambíguo.

IDs novos produzidos pela V4 devem ser UUID v5 determinísticos no namespace já usado pelas
migrações anteriores. Linhas derivadas usam escopos determinísticos documentados. Exceções de
reconciliação precisam ser explícitas, documentadas e testadas.

## Pending e quarentena

Cada item de `pending-mapping` registra tabela, contagem, motivo e evidência do contrato ausente ou
incompatível.

Cada item de quarentena registra:

- tabela de origem;
- ID legado sanitizado;
- campo relacionado, quando aplicável;
- motivo normalizado;
- destino e passo pretendidos, quando confirmados;
- estado da decisão.

Valores de senha, tokens, chaves, documentos confidenciais e conteúdo livre potencialmente
sensível não são copiados para a quarentena. A rastreabilidade usa ID legado e metadados mínimos.

## Comparação com migrações anteriores

`reports/previous-mapping-comparison.json` deve informar, por tabela:

- regra anterior encontrada;
- alteração de colunas entre backups;
- diferença de contagem de registros;
- regra V4 reutilizada ou invalidada;
- motivo de qualquer mudança de classificação.

Uma regra anterior não é aceita apenas por existir: ela deve ser revalidada contra o dump novo e o
comportamento legado, além do contrato atual. Divergências registram a decisão anterior invalidada
e a evidência que a substituiu.

## Revisão semântica por domínio

As 312 tabelas são revisadas nos seguintes grupos:

- Administração e permissões;
- Atendimento, Comercial, Financeiro, Contábil e Fiscal;
- Integração, projetos e tarefas;
- Regularize;
- RH e Departamento Pessoal;
- Tecnologia, estoque e credenciais;
- Certificados e Parcelamento;
- Marketing, PEC, Triagem, Wiki e Workspace;
- auxiliares e históricas.

Nas regras V2 auditadas, nove origens continuam estruturalmente diretas, com correções de colunas,
defaults, referências ou quarentena. Sete exigem mudança estrutural:

- `tb_rh.colaboradores`: merge na identidade de usuário administrativo;
- `tb_regularize.clientes`: merge condicional no cliente de Integração quando o vínculo explícito
  existir;
- `tb_integracao.prospeccao_comercial`: split entre a faceta comercial de `clients` e
  `integracao.projects`;
- `tb_integracao.tarefas`: tarefa com resolução ou derivação determinística de modelo e projeto;
- `tb_regularize.orientaoes_processual`: orientação com processo existente ou processo técnico
  determinístico quando o fluxo autônomo legado for comprovado;
- `tb_regularize.orientaoes_processual.socios`: agregação no JSON
  `regularize.proceduralGuidances.partners`, sem fabricar relações globais de PF/PJ;
- `tb_regularize.clientes_senhas`: expansão por slot lógico em catálogo de sites e credenciais
  criptografadas.

## Segurança e tratamento de erros

- Todos os scripts de mapeamento operam sem `--apply` e não possuem comandos de escrita no banco.
- O preflight inicia com `BEGIN TRANSACTION READ ONLY` e finaliza com `COMMIT` ou `ROLLBACK`.
- Erros de parser identificam arquivo e posição sem imprimir o registro completo.
- Relatórios passam por uma varredura de padrões sensíveis antes de serem gravados.
- A análise do legado registra nomes de coluna e referências de código, nunca valores dos
  `INSERT` dos dumps.
- Chaves de criptografia são usadas apenas para validar prontidão e nunca são registradas.
- Ausência de chave não expõe segredo; gera bloqueio objetivo no preflight.
- Dumps e artefatos temporários não são adicionados ao Git.

## Desenho da futura limpeza e carga

A implementação futura será desenhada somente depois da aprovação do mapeamento V4. Ela deverá:

1. produzir backup verificável dos dados atuais da Castelo;
2. gerar relatório exato de remoção por tabela;
3. preservar o registro da organização Castelo;
4. excluir dados operacionais com `DELETE` escopado pelo tenant e pelas relações comprovadas;
5. nunca usar `TRUNCATE`;
6. tratar tabelas sem `organization_id` direto por caminhos de chave estrangeira comprovados;
7. carregar em ordem de dependências dentro de transação controlada;
8. validar contagens, referências, tenant e criptografia antes do `COMMIT`;
9. executar `ROLLBACK` diante de qualquer divergência;
10. exigir autorização explícita imediatamente antes de qualquer escrita.

## Estratégia de testes

Os testes devem cobrir:

- parsing de dumps com múltiplos `INSERT`, escapes, nulos e caracteres especiais;
- extração de colunas e contagens;
- inventário exato das 312 tabelas;
- rejeição de tabela ignorada ou duplicada;
- UUID v5 determinístico por `sourceTable integral + id legado`;
- cobertura semântica das 312 tabelas com evidência do legado;
- regressões das regras V2/V3 e dos fluxos posteriores, incluindo invalidação de regras antigas;
- regras `insert`, `merge`, `lookup`, `derived` e `aggregate`;
- emissões 1:N e quarentena independente por emissão;
- identidade compartilhada sem duplicar `User` ou `Client`;
- consistência entre tarefa, projeto e cliente;
- orientação com processo válido e sócios no JSON correto;
- credenciais separadas por slot lógico e criptografadas;
- classificação integral em `confirmed` ou `pending`;
- separação entre tabela pending e registro em quarentena;
- geração determinística de CSV e JSON;
- comparação com mapeamentos anteriores;
- sanitização de senhas e segredos;
- preflight somente leitura;
- relatório de conflitos e dependências;
- `readyForMigration: false` enquanto houver bloqueios.

## Critérios de aceite

- O inventário contém exatamente as 312 tabelas do backup de `03.08.2026`.
- Nenhuma tabela é silenciosamente ignorada.
- Cada tabela possui evidência sanitizada do comportamento legado ou motivo explícito de ausência
  de referência.
- Cada tabela está `confirmed` ou `pending` com motivo.
- Cada regra `confirmed` possui evidência de destino no Prisma e nos serviços atuais.
- Cada transformação informa origem, destino, modo, identidade, precedência e regra.
- Toda linha lida fecha em emissão, merge, agregação, não emissão justificada ou quarentena.
- Cada quarentena possui tabela, ID legado sanitizado, campo quando aplicável e motivo.
- O relatório compara o backup novo com as decisões anteriores.
- O preflight compara a carga planejada com o Supabase atual sem escrever dados.
- Os artefatos não contêm senhas ou segredos em claro.
- O manifesto registra fonte, hashes, contagens, tenant, data e estado do dry-run.
- A primeira entrega não contém nem executa limpeza ou carga no Supabase.
