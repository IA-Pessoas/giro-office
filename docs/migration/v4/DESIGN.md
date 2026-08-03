# Migração V4 — Mapeamento integral do legado

## Contexto

O sistema legado da Castelo Contabilidade é mono-tenant. O backup mais recente está em
`/home/bruno/Documents/03.08.2026` e contém 312 dumps SQL, com os mesmos nomes de arquivos dos
backups de `06.07.2026` e `10.07.2026`.

As migrações anteriores cobriram conjuntos específicos na V2, na V3 e nos fluxos posteriores de
RH/Departamento Pessoal, Tecnologia, Certificados e Parcelamento. A V4 deve revisar todo o backup,
sem limitar o inventário aos domínios anteriormente migrados.

Tenant de destino:

- organização: Castelo Contabilidade;
- `organization_id`: `e8048d1c-0830-45d7-84de-68e20abd685b`.

## Objetivo

Criar um pacote V4 autocontido que inventarie e classifique as 312 tabelas do backup, reaproveite
regras comprovadas das migrações anteriores, produza mapeamentos auditáveis e execute um preflight
somente leitura contra o Supabase atual.

Esta primeira entrega não limpa nem grava dados no Supabase e não cria o script de aplicação final.

## Decisões aprovadas

- Mapear as 312 tabelas, sem limitação por módulo.
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
│   ├── previous-mapping-comparison.json
│   └── supabase-preflight.json
└── scripts/
    ├── inventory.mjs
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

### 2. Catálogo central de mapeamento

`docs/migration/v4/scripts/build-mapping.mjs` combina quatro fontes:

1. inventário do backup de `03.08.2026`;
2. artefatos V2 e documentação V3;
3. regras versionadas nos scripts posteriores de migração;
4. contratos reais do Prisma e dos serviços atuais.

O catálogo é central, mas as regras são organizadas por domínio dentro do código para evitar um
fluxo monolítico. Toda tabela de origem recebe exatamente uma entrada.

### 3. Preflight do destino

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

### Campos do mapeamento de tabela

- tabela de origem;
- quantidade de registros na origem;
- tabela de destino, quando confirmada;
- estado `confirmed` ou `pending`;
- motivo do estado;
- domínio funcional;
- origem da regra: V2, V3, fluxo posterior ou validação V4;
- estratégia de identidade;
- dependências de carga;
- total preparado e total em quarentena.

### Campos do mapeamento de coluna

- tabela e coluna de origem;
- tabela e coluna de destino;
- transformação;
- tratamento de nulos e obrigatoriedade;
- papel na identidade ou referência;
- classificação de sensibilidade;
- origem da regra;
- observação objetiva quando a coluna não for preservada.

## Identidade e reconciliação

A identidade técnica deve continuar baseada em `sourceTable integral + id legado`. Campos naturais como
nome, CPF, CNPJ, e-mail, login e RG podem auxiliar a conferência, mas não substituem a identidade
legada.

IDs novos produzidos pela V4 devem ser UUID v5 determinísticos no namespace já usado pelas
migrações anteriores. Exceções de reconciliação precisam ser explícitas, documentadas e testadas.

## Pending e quarentena

Cada item de `pending-mapping` registra tabela, contagem, motivo e evidência do contrato ausente ou
incompatível.

Cada item de quarentena registra:

- tabela de origem;
- ID legado sanitizado;
- campo relacionado, quando aplicável;
- motivo normalizado;
- destino pretendido, quando confirmado;
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
contrato atual.

## Segurança e tratamento de erros

- Todos os scripts de mapeamento operam sem `--apply` e não possuem comandos de escrita no banco.
- O preflight inicia com `BEGIN TRANSACTION READ ONLY` e finaliza com `COMMIT` ou `ROLLBACK`.
- Erros de parser identificam arquivo e posição sem imprimir o registro completo.
- Relatórios passam por uma varredura de padrões sensíveis antes de serem gravados.
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
- regressões das regras V2/V3 e dos fluxos posteriores;
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
- Cada tabela está `confirmed` ou `pending` com motivo.
- Cada transformação informa origem e regra.
- Cada quarentena possui tabela, ID legado sanitizado, campo quando aplicável e motivo.
- O relatório compara o backup novo com as decisões anteriores.
- O preflight compara a carga planejada com o Supabase atual sem escrever dados.
- Os artefatos não contêm senhas ou segredos em claro.
- O manifesto registra fonte, hashes, contagens, tenant, data e estado do dry-run.
- A primeira entrega não contém nem executa limpeza ou carga no Supabase.
