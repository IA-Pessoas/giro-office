# Preparação do lote de 12 PF — 13/09/2026

**Estado atual: carga autorizada e CONCLUÍDA em 14/09/2026 às 01:54 UTC.** Foram inseridos
12 PF, passando de 810 para 822. A leitura posterior confirmou os 312 valores, zero colisões
e preservação integral dos 810 anteriores. Não repetir a carga, preparação ou testes.
Ler primeiro a [passagem para o próximo agente](./CARGA-PF-12-2026-09-14.md).
As seções abaixo preservam a cronologia da preparação; pendências de autorização descritas
nos retratos antigos foram resolvidas especificamente para estes 12 PF. As migrations
e os demais lotes continuam fora dessa execução.

**Os 12 payloads passaram pelo contrato de cadastro PF e pelo ensaio isolado em PostgreSQL 17.6.**
O ensaio terminou às **23:22 UTC de 13/09/2026**, com 22 cenários aprovados e restauração
conferida. O contêiner e todos os arquivos exclusivos do teste foram removidos. O resultado
agregado está registrado abaixo; naquele ensaio nenhuma carga foi feita no destino da aplicação.

**Atualização de 14/09/2026:** o backup do banco atual foi gerado e sua restauração isolada
foi validada. A limpeza terminou às **00:56 UTC**. Permanecem somente o backup original e
seu manifesto privado, conforme a retenção aprovada até a conclusão da migração.

**Executor definitivo preparado em 14/09/2026:** revisão independente concluída,
74 testes locais e 24 cenários PostgreSQL aprovados. A conferência pelo próprio executor,
somente leitura, terminou às **01:37 UTC**, sem colisões. Naquele momento o lote aguardava
a autorização específica; sua execução posterior está no documento de carga concluída.

A convenção de datas foi aprovada pelo usuário: preservar exatamente o dia civil do legado
e representá-lo como `YYYY-MM-DDT00:00:00.000Z`. Na preparação anterior ao ensaio não houve
alteração no banco, execução de migrations ou comando Docker.

## Escopo e autorização

O subconjunto é exatamente o da proposta privada `dry-run/proposta-pf-12-sem-gravacao.json`,
derivado da [simulação de clientes](./SIMULACAO-CLIENTES-2026-09-13.md). O hash da proposta
está registrado no comprovante de aprovação. A aprovação inicial cobria a convenção de datas
e a preparação local. Depois, o usuário autorizou especificamente o ensaio dos 12 registros
em contêiner temporário, reutilizando a imagem existente, sem instalação ou download,
sem rede/portas, limitado a 512 MiB e uma CPU, com limpeza integral após o teste.
A autorização do ensaio não aprovava identidade final, carga ou DDL. A aprovação específica
posterior e a carga concluída estão no documento de passagem; nenhum DDL foi autorizado.

O 13º PF, que tem telefone sem destino, continua fora. As demais pendências dos 556 candidatos
e dos outros domínios continuam nos relatórios anteriores. Nenhuma das dez migrations pendentes
é dependência física direta deste lote de `clients.pf`.

## Payload e rastreabilidade

| Verificação | Resultado |
| --- | --- |
| Registros / colunas por registro | 12 / 26, cobrindo todas as colunas físicas de `clients.pf` |
| Origem | `tb_regularize.pf`, chave própria `codigo` |
| Identidade proposta | UUIDv5 V4 usual, conferido com a proposta anterior |
| Organização | Organização Castelo conferida por ID no destino; nenhum pai fictício no payload |
| Nascimentos | 12 datas civis válidas; zero alteração do dia |
| Vencimentos RG/CNH da origem | Zero linhas associadas a esses 12 PF |
| Quatro colunas opcionais de vencimento por PF | 48 valores nulos por ausência de contribuição na origem |
| Status | Os 12 já são `Ativo` no legado; valor preservado |
| Observações e telefone | Vazios na origem dos 12, sem conteúdo descartado |
| Identidade/permissão de carga | Pendente no retrato inicial; aprovada e utilizada em 14/09 somente para estes 12 PF |

Foi usada a função pura existente `normalizeClientPfSourceRow`, sem chamar o runner V4,
backfill ou serviço operacional. A rastreabilidade registra origem e hash de cada campo,
transformação proposta e hash do valor resultante. Os efeitos de representação encontrados
foram: pontuação do CPF em dez registros, formatação de CEP em 11, tradução do estado civil
em 12, convenção de nascimento em 12 e normalização de espaços no campo de filiação em um.
Nenhum cadastro existente foi normalizado ou atualizado.

O arquivo `dry-run/pf-12/payload.json` contém dados pessoais reais dos 12 registros, para
revisão local restrita. Arquivos são `0600`, diretórios `0700`, e todo o diretório está
ignorado pelo Git. O conteúdo pessoal não foi colocado neste relatório nem na conversa.
O ZIP original permanece no caminho informado pelo usuário e não foi adicionado ao Git.

O materializador recusa mudança de digest do ZIP, mudança da seleção, telefone/observação
preenchidos, novo vencimento não revisado, falta de campo, documento inválido, alteração de
status e colisões de ID/código/CPF/RG dentro do lote. Não contém conexão ou escrita de banco.
Ele exige o comprovante de aprovação já registrado, confere seu hash de seleção e não
gera nem amplia aprovações durante a regeneração do payload.

## Conferência renovada do destino

Consultas executadas em transações `REPEATABLE READ READ ONLY`, com timeout e `ROLLBACK`.
O retrato principal foi obtido às **22:04 UTC de 13/09/2026**; o schema foi conferido novamente
na preparação da proposta de ensaio.

| Verificação | Resultado |
| --- | --- |
| Organização esperada | Uma correspondência |
| PF existentes na organização | 810 |
| Colisões de ID V4 ou alias V2 por CPF, em qualquer organização | Zero |
| Colisões de código, CPF, RG e nome no tenant | Zero em cada chave consultada |
| Logs estruturados ligados aos IDs/chaves conhecidos e ao domínio PF | Zero |
| Auditoria estruturada ligada aos IDs/chaves conhecidos e ao domínio PF | Zero |
| Estrutura física | 26 colunas, PK em ID, FK para `organizations(id)` |
| Triggers de usuário em `clients.pf` | Zero |

A FK real usa `ON UPDATE CASCADE ON DELETE RESTRICT`. Não existe unique físico adicional
para código, CPF ou RG; o serviço verifica essas chaves antes do cadastro. O futuro executor
precisa tratar concorrência e colisões sem depender somente da PK ou de `ON CONFLICT`.

O alias V2 verificado usa o namespace textual histórico e `client-pf:cpf:<CPF>`. Sua sondagem
é evidência adicional; não altera o ID proposto nem prova execução histórica dessa estratégia.
As consultas a logs/auditoria cobrem campos estruturados e aliases conhecidos. Não demonstram
ausência absoluta de exclusões, ações por SQL direto ou registros sob identidades desconhecidas.
Essa limitação acompanha a revisão final da correspondência; não foi convertida em aprovação.

## Validações executadas

- Os **12 payloads passaram** em `createClientPfBodySchema`, importado do serviço Regularize.
  IDs/organização e colunas opcionais nulas foram separados apenas para adaptar a chamada ao
  contrato HTTP; o payload físico continua contendo todas as 26 colunas.
- O parser do contrato preservou os valores propostos. Datas foram convertidas para `Date`
  mantendo a representação ISO aprovada.
- **36 verificações de datas reais**: 12 nascimentos em UTC, `America/Sao_Paulo` e
  `Pacific/Kiritimati`, sem mudança de dia na apresentação por ISO.
- **12 verificações sintéticas de datas**: quatro datas em três fusos, incluindo ano bissexto
  e datas de transição histórica de horário de verão. Dois casos negativos do contrato
  rejeitaram nome vazio e campo inesperado.
- No PostgreSQL, **quatro datas sintéticas** conservaram dia e meia-noite com conversão
  explícita de `timestamptz` para `timestamp(3)` em UTC, usando somente SELECT.
- A regeneração de cinco artefatos sobre os mesmos insumos reproduziu os mesmos hashes.
  O manifesto registra hashes do payload, fontes do contrato/normalizador e scripts utilizados.
- O materializador passou ainda por um caso positivo e cinco negativos de datas civis,
  uma aprovação sintética válida e duas tentativas de mudar a seleção, ambas rejeitadas.

O primeiro comando `tsx` foi impedido pelo socket IPC do sandbox. A repetição fora do sandbox
foi autorizada e passou; não houve alteração de dependências. Esses testes não executaram
INSERT/rollback de carga, restauração ou serviços operacionais.

## Procedimento do ensaio

Não foram encontrados utilitários PostgreSQL instalados no host. A alternativa posteriormente
autorizada reutilizou a imagem local `supabase/postgres:17.6.1.136`, fixada pelo ID
`sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`, sem pull.
O servidor confirmou a versão 17.6. O contêiner utilizou usuário `postgres`, raiz somente
leitura, capacidades removidas, limite de processos, rede `none`, nenhuma porta publicada
e conexão por socket em diretório temporário privado. O cluster novo, o backup e os logs
ficaram em `tmpfs`; não foram criados volumes persistentes.

O entrypoint e o healthcheck herdados da imagem foram substituídos/desativados. O cluster foi
inicializado do zero, sem extensões pré-carregadas, credenciais da aplicação ou serviços
operacionais. O executor conferiu nome do banco, versão 17, diretório de dados e conexão
Unix antes de acessar as tabelas de teste.

Foi preparado `schema-ensaio-proposta.sql` com os 26 tipos/nulabilidades/defaults e as duas
constraints extraídos do banco. Ele recusa banco com nome diferente ou conexão TCP e termina
com `ROLLBACK`. A tabela pai reduzida a `organizations.id` é uma fixture para conferir a FK;
não reproduz todas as regras de organizações, papéis ou segurança do sistema.

O procedimento abaixo orientou a execução autorizada:

1. Conferir hashes e carregar somente este payload no ambiente de teste, com uma fixture de
   organização. Usar parâmetros para dados, sem concatenar nomes/documentos em SQL.
2. Verificar inserção das 12 linhas, os 26 valores e as datas após leitura do PostgreSQL.
   Conservar referências antigas e linhas sintéticas preexistentes usadas no teste.
3. Reexecutar e exigir zero inserções adicionais, confrontando payload completo. Divergência
   de conteúdo ou colisão de código/CPF/RG com outro ID deve interromper o lote, sem UPDATE.
4. Testar colisões e uma FK inválida na mesma transação: nenhuma aplicação parcial pode
   permanecer. Testar concorrência no controle das chaves de negócio.
5. Validar que nenhum log operacional, reconciliação de processos, notificação, permissão
   ou evento foi criado. O endpoint normal PF gera log e chama reconciliação; não é o executor
   histórico proposto.
6. Exercitar backup e restauração do ambiente de teste e registrar o resultado agregado. Isso valida
   o procedimento, mas não substitui backup consistente e restauração comprovada do destino
   antes de qualquer autorização posterior de produção.

Antes da produção, ainda será necessário fechar a decisão de correspondência/exclusão,
aprovar os valores/transformações, revisar o executor de INSERT e seus controles de concorrência,
renovar o retrato do destino, comprovar recuperação e obter autorização específica de carga.
O plano não propõe apagar os 12 registros como rollback automático após integrações futuras.

## Resultado do ensaio e limpeza

A execução concluída ocorreu entre **23:22:01 e 23:22:17 UTC**, com saída zero.
Foram aprovados **22 cenários**, mais a verificação da restauração em um segundo banco
descartável. A tabela PF reproduziu as 26 colunas, tipos, nulabilidades, defaults, PK e FK
do retrato do destino. A tabela `organizations` continha somente a fixture mínima do vínculo.

| Verificação | Resultado |
| --- | --- |
| Carga inicial dos 12 PF em transação | 12 inserções e 312 valores conferidos; rollback restaurou o estado inicial |
| Carga confirmada no banco descartável | Três registros do próprio lote usados como vencedores concorrentes, mais nove inserções; total de 12 PF |
| Cadastro sintético preexistente | Uma linha preservada integralmente; total físico de 13 PF com a fixture |
| Datas | Os valores retornados conservaram a representação UTC aprovada; datas opcionais nulas preservadas |
| Reexecução integral | Zero inserções adicionais, 12 registros idênticos reconhecidos |
| Divergência sob o mesmo ID | Rejeitada sem atualização |
| Duplicidades | ID repetido e colisões de código/CPF/RG rejeitados; inclui outro ID duplicado já presente ao reexecutar |
| Erro no último registro | FK inválida e campo obrigatório nulo causaram rollback integral, sem carga parcial |
| Concorrência | Cinco cenários confirmaram bloqueio real via `pg_locks` e `pg_blocking_pids`; perdedores com chave repetida foram rejeitados |
| Preservação nas falhas | Hash do conteúdo integral das duas tabelas igual antes e depois dos rollbacks |
| Backup e restauração | `pg_dump -Fc` e `pg_restore --single-transaction`; schema, hash integral e 312 valores do lote iguais após restauração |
| Efeitos operacionais | Somente duas tabelas de fixture e zero triggers de usuário; nenhum serviço da aplicação chamado |
| Instalações / downloads | Zero; imagem e driver `pg` já existentes |
| Limpeza | Contêiner, dois bancos, dump, logs, socket, scripts e relatórios temporários removidos |
| Preservação externa | 44 contêineres preexistentes com mesmos IDs, imagens, estado, início e contagem de reinícios; inventários de imagens/volumes iguais |
| Insumos | ZIP e 12 arquivos preexistentes de preparação preservados, com hashes iguais |

Uma primeira tentativa falhou na checagem de disponibilidade, antes de enviar o payload,
porque o caminho dos executáveis não correspondia à organização Nix dessa imagem. Sua limpeza
também foi concluída. O caminho real foi conferido em contêineres de diagnóstico descartáveis,
e uma inicialização sem dados pessoais confirmou PostgreSQL 17.6 por socket antes da repetição.
Todos os contêineres de diagnóstico foram removidos.

O executor usado foi exclusivo do ensaio e foi apagado conforme solicitado. Ele utilizava
INSERT parametrizado e `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE`, antes das comparações
em `READ COMMITTED`. Esse lock impede escritas concorrentes durante a transação e permite
leituras comuns, conforme a [documentação do PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html).
Seu uso futuro no destino exigiria aprovação do impacto sobre cadastros. Sem unicidade
física para as chaves de negócio, um escritor que não faça a mesma conferência ainda pode
criar duplicatas depois da liberação do lock. O ensaio não resolve essa limitação do sistema.

Este resultado valida o lote e o procedimento descartável, não um executor de produção já
integrado. Também não valida as dez migrations pendentes, o schema completo de organizações,
RLS, eventos ou a restauração do banco de produção. A aprovação da carga e a revisão do executor
definitivo continuam pendentes. Os comprovantes privados anteriores permanecem como retratos
da preparação; seus campos de autorização não foram alterados retroativamente.

## Conferência posterior ao ensaio e próxima aprovação

Consultas somente leitura foram renovadas às **23:36 UTC de 13/09/2026**, em transações
`REPEATABLE READ READ ONLY`, com timeouts e `ROLLBACK`. A estrutura foi comparada
programaticamente ao retrato usado no ensaio.

| Item | Resultado atualizado |
| --- | --- |
| PF da organização | 810 |
| Correspondências dos 12 candidatos | Zero por ID V4/alias V2, código, CPF, RG e nome |
| Grupos duplicados no destino PF | Zero por código, CPF e RG normalizados, na organização |
| Estrutura de PF | Mesmas 26 colunas, duas constraints, RLS e quantidade de triggers do retrato ensaiado |
| Dependências que apontam para PF | `regularize.partners.pf_id` e `regularize.process.client_pf_id` |
| Histórico de migrations | 128 concluídas sem reversão, zero em andamento; nenhuma das dez pendentes registrada |
| Nove tabelas das migrations pendentes | Continuam ausentes |
| Dependência das dez migrations para estes 12 PF | Nenhuma dependência física direta |

As referências recebidas têm comportamentos diferentes em exclusões: sócios usam `RESTRICT`
e processos usam `SET NULL`. Isso reforça a restrição de não apagar cadastros como rollback
automático depois da carga. A conferência atual continua sem provar ausência de exclusões
históricas; aprovar a identidade proposta permanece uma decisão anterior à carga.

O banco mede **587.287.699 bytes, aproximadamente 560 MiB**, segundo `pg_database_size`.
Esse é o tamanho físico observado, não uma previsão do tamanho comprimido ou do espaço exato
de restauração. A relação PF, incluindo índices, mede 466.944 bytes. Na VPS havia cerca de
29,8 GiB livres em disco e 3,7 GiB de memória disponível na inspeção, valores sujeitos a mudança.

Na inspeção anterior à coleta de 14/09, não foi encontrado um backup do destino com recuperação
comprovada nos caminhos locais consultados. O estado de backups gerenciados pelo provedor não
foi verificado. O ZIP recebido
continua sendo o export do legado. O caminho de backup histórico citado no README V2,
`/tmp/giro-office-supabase-backups`, não existe nesta máquina.

O script existente `scripts/backup-supabase-jsonl.mjs` não foi executado. Sua análise mostrou
que cada contagem e cada COPY abre uma sessão independente, sem snapshot compartilhado;
ele não exporta DDL, permissões ou sequências. Além disso, o recorte `--migration-v2-only`
não inclui `clients.pf`. Por isso, ele não comprova a recuperação exigida para esta carga.

### Procedimento de backup autorizado

O usuário autorizou **somente backup e verificação de recuperação** do banco atual do Giro,
incluindo a retenção do backup original. A execução está registrada abaixo. A autorização
não inclui carga dos 12 PF, alterações de registros ou migrations.

1. Reutilizar a imagem PostgreSQL 17 já existente, sem instalação ou download. Usar no máximo
   um contêiner temporário por vez, limitado a 512 MiB e uma CPU, sem portas publicadas e sem
   alterar os serviços existentes. Revalidar espaço e memória antes de começar; interromper
   se os arquivos desta operação atingirem 4 GiB ou o disco livre cair abaixo de 8 GiB.
2. O processo de coleta precisa conectar-se ao banco real exclusivamente para leitura.
   A conexão já usada pelo Regularize foi identificada como pooler na porta 5432 do projeto
   esperado; nenhuma credencial foi exibida ou exportada nesta preparação. Confirmar a rota
   de sessão e o TLS antes do dump. Não usar o MCP para transportar linhas ou senhas.
3. Gerar `pg_dump` em formato customizado, em uma sessão de leitura consistente, incluindo
   definições e dados do banco. Conferir também as definições dos papéis necessários à
   restauração, sem exportar suas senhas. Não omitir objetos silenciosamente em caso de
   falta de permissão, incompatibilidade de extensão ou erro de leitura. Credenciais usadas
   na coleta ficam apenas em canal/arquivo temporário protegido, removido ao encerrar.
4. Guardar o backup em
   `docs/migration/v4.1/backups/pre-carga-pf12-<UTC>/`, com diretório `0700`, arquivos `0600`,
   manifesto de escopo/versões e hashes. O caminho já está excluído pelo `.gitignore` de V4.1.
   **Retenção aprovada:** conservar o backup original até a conclusão da migração.
   Ele não é uma cópia descartável do ensaio.
5. Restaurar em um segundo banco isolado, sem rede, workers ou credenciais operacionais.
   Como o banco observado já supera 512 MiB, o diretório de dados restaurado deve usar espaço
   temporário protegido em disco real; `/tmp` nesta VPS é tmpfs. Manter o limite de memória.
   Conferir as versões de extensões
   e os papéis necessários antes da restauração. Restaurar permissões e estrutura, sem tratar
   uma restauração que ignorou erros como válida.
6. Comparar o inventário de objetos, constraints, sequências, RLS, grants e contagens obtidos
   no snapshot do backup, além do conteúdo de PF e seus vínculos. Comparações do conteúdo
   devem usar o mesmo snapshot; uma nova leitura após o dump não prova igualdade se houver
   escritas concorrentes. Não aplicar as dez migrations durante essa verificação.
7. Apagar o contêiner, o banco restaurado, logs, credenciais e todos os arquivos exclusivos
   da verificação. Manter somente o backup original e o manifesto, conforme a retenção aprovada.
   Registrar resultados agregados no relatório de migração.

O [PostgreSQL documenta a consistência do pg_dump durante escritas concorrentes](https://www.postgresql.org/docs/17/app-pgdump.html).
A [documentação do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
recomenda conexão direta para dumps; o pooler de sessão é a alternativa indicada quando a
conexão direta não é acessível por IPv4. A rota precisa ser validada antes da coleta.
Um backup lógico do banco não inclui arquivos de objetos do Storage nem a configuração
completa da plataforma; seu escopo deve constar no manifesto.

A recuperação isolada foi comprovada na etapa abaixo. A decisão de carga dos 12 PF ainda
exige identidade, valores e executor definitivo para revisão. O executor utilizado no ensaio
foi apagado, portanto seu resultado não aprova automaticamente outro script de carga.

Evidência privada desta atualização:
`preflight/prontidao-pf12-2026-09-13.json`. Os arquivos e aprovações da preparação anterior
foram preservados. A atualização de 23:36 UTC ainda não tinha criado o backup do banco atual;
a execução autorizada posterior está registrada a seguir.

### Backup do destino e restauração verificada — 14/09/2026

Coleta entre **00:17 e 00:19 UTC**, em PostgreSQL 17.6, com transação
`REPEATABLE READ READ ONLY` e snapshot exportado compartilhado pelo catálogo e pelo `pg_dump`.
A conexão ao pooler de sessão teve TLS e nome do servidor verificados com a
[CA oficial do Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement), usada
somente nesta operação. O dump terminou com código zero e nenhum aviso.

O ensaio final de restauração ocorreu entre **00:51:35 e 00:52:12 UTC**. Usou a imagem já
existente, sem download ou instalação, um contêiner por vez, 512 MiB, uma CPU, sem rede,
portas publicadas ou workers operacionais. A fonte permaneceu somente leitura.

| Verificação | Resultado |
| --- | --- |
| Arquivo customizado | 42.229.104 bytes, aproximadamente 40,27 MiB |
| SHA-256 do arquivo, antes e depois da restauração/limpeza | `94790e90dc995b5fb65086d75b3ef9de42d71d00d7ba319a50a06cd6cdc3aaef` |
| Inventário do arquivo | 1.346 entradas; cobertura das 145 cargas de tabelas e duas sequências conferida |
| Contagens do mesmo snapshot | 825.789 linhas em 145 tabelas físicas, todas iguais após restaurar; pais de partições não contados novamente |
| Conteúdo completo por fingerprint SHA-256 | `organizations`: 152; `clients.pf`: 810; `regularize.partners`: 935; `regularize.process`: 443 — todos iguais |
| Estrutura e permissões comparadas | Todas as seções do catálogo comparado iguais, incluindo 1.541 colunas, 478 constraints, 312 índices, 28 tipos, 16 papéis, 22 memberships, dez schemas e seis extensões |
| Sequências | Dois valores/estados iguais aos `SEQUENCE SET` efetivamente arquivados, sem exigir igualdade com observações posteriores da fonte |
| Duplicidades PF da organização no backup | Zero grupos por código, CPF e RG normalizados; vazios excluídos da comparação |
| Carga dos 12 PF / dez migrations no destino | Nenhuma execução |

A receita de recuperação preserva os owners das extensões, a configuração original dos
papéis e os grants iniciais de `graphql`/`graphql_public`, necessários além do arquivo
customizado. O manifesto contém o SQL de preparação e a lista exata das entradas restantes;
nenhum objeto divergente foi excluído da comparação para fazê-la passar.

O teste identificou que `/tmp` usa RAM nesta VPS: manter o banco restaurado ali atingia o
limite de memória. Os dados temporários foram transferidos para uma pasta privada em ext4,
mantendo 512 MiB; a execução final teve zero eventos de OOM. Essa pasta também foi apagada.

**Limites da prova:** o conteúdo completo foi comparado por fingerprint nas quatro tabelas
indicadas; nas demais, por restauração sem erro e contagem exata. Objetos internos pertencentes
a extensões não fazem parte da comparação comum de objetos do dump. Não houve comparação
independente exaustiva de todo o catálogo PostgreSQL, incluindo configurações/ACLs do banco,
publicações e comentários. O backup lógico não inclui arquivos externos do Storage,
configuração da plataforma ou senhas dos papéis. A prova não equivale a restaurar por cima
do Supabase gerenciado nem a validar o funcionamento integral da aplicação após uma troca
de banco. Escritas legítimas posteriores ao snapshot não estão neste backup.

**Retenção e limpeza:** em `backups/pre-carga-pf12-20260913T234736Z/` ficaram apenas
`database.dump` e `manifest.json`, ambos `0600`, em diretório `0700` ignorado pelo Git.
Conservar os dois até a conclusão da migração. O manifesto reúne metadados e evidências de
recuperação sem senhas de conexão; seu conteúdo continua privado.

Às **00:56:23 UTC**, a limpeza conferiu ausência de todos os contêineres e diretórios desta
operação, incluindo banco restaurado, scripts, logs e CA temporária. Os **44 contêineres
preexistentes**, suas imagens e volumes permaneceram iguais ao inventário anterior. Os
**13 arquivos originais conferidos**, incluindo ZIP e preparação PF, mantiveram seus hashes.
Nenhuma instalação, reinício de serviço existente, commit, push ou carga no destino ocorreu.

Identificadores da execução do ensaio, sem dados pessoais:

- Payload SHA-256: `9bd95c6b680c49035888745caa27333d281246a2ced64df54cfb83764003e35e`.
- Schema do ensaio SHA-256: `9a4e9e0211f642d8e38b4add36ef2474d88df9b04d6e2aedaaf5b26e36288915`.
- Conteúdo final das duas tabelas SHA-256: `32616d5fb1ecba4e48e7f105a5fb44e500943da7352c9ba08c9327564ec95809`.
- Código descartável testado SHA-256: `0006c2238f67147a85d2ec7f4552ff217b8880ec45382cf0b2ce3285d7b3f51f`.

## Artefatos privados

### Executor definitivo, revisão e prontidão — 14/09/2026

O pacote privado [pf-12-executor](./dry-run/pf-12-executor/README.md) contém o comando
definitivo, núcleo transacional, inspeção de schema, validação de autorização, IO dos
artefatos, CA pública oficial, proposta com hashes e comprovantes agregados. Mantém
exatamente o payload existente: 12 PF, 26 colunas e 312 valores. Os arquivos originais
e seus campos históricos de aprovação foram preservados.

A revisão independente encontrou e corrigiu duas falhas: a leitura dos dados precisava
usar os mesmos bytes cujo hash foi verificado; e a atualização do recibo precisava preservar
a versão anterior se faltasse espaço ou falhasse a escrita. Hash e parse agora usam um único
buffer; recibos usam temporário privado, sincronização e rename. A segunda revisão não deixou
achados abertos nesse recorte. Cinco testes específicos cobrem essas duas correções.

**Validação do código final:** 74 testes locais passaram, abrangendo contrato físico,
datas, duplicidades, divergência sob o mesmo ID, schema, autorização e persistência de
recibos. Ausência de aprovação, aprovação expirada e aprovação para outro pacote bloqueiam
o comando antes de Docker/conexão; essas aprovações foram simuladas somente em memória.
Não foi criado `approval.json` real. A sintaxe dos cinco módulos foi validada.

O ensaio PostgreSQL ocorreu entre **01:32:00 e 01:32:19 UTC**, com 24 cenários aprovados.
Usou o núcleo definitivo, imagem PostgreSQL 17.6 existente e a mesma estrutura observada
de PF, incluindo as duas FKs recebidas em tabelas mínimas. Não reproduziu o schema completo
dessas tabelas nem os serviços operacionais. O teste comprovou:

| Verificação | Resultado |
| --- | --- |
| Inserção e preservação | 12 inserções, 312 valores conferidos e uma linha sintética anterior preservada |
| Reexecução | Zero inserções, 12 reconhecidos por igualdade integral |
| Colisões | Outro ID, alias V2, documentos normalizados e conteúdo divergente rejeitados |
| Falha no 12º INSERT | Erros reais de FK e NOT NULL causaram rollback das 11 inserções anteriores |
| Concorrência | Espera real comprovada no PostgreSQL; perdedor relê e reconhece o lote ou rejeita divergência |
| Tempo de lock | Timeout real interrompe sem alterar a linha anterior |
| COMMIT confirmado e resposta perdida | Resultado incerto informado, sem retry ou ROLLBACK; segunda conexão confirmou os 12 registros |
| Conexão somente leitura por padrão | Somente `BEGIN ... READ WRITE` do fluxo autorizado permite inserir |

Duas tentativas iniciais terminaram antes de iniciar o PostgreSQL, porque `env` e `bash`
não estavam no perfil Nix usado pelo harness. Um diagnóstico descartável conferiu os caminhos
reais e corrigiu somente o ensaio. As tentativas tiveram zero registros carregados e limpeza
confirmada. A execução final teve zero OOM e zero reinícios, usando 512 MiB, uma CPU, rede
`none`, zero portas e PGDATA temporário em ext4. Contêiner e PGDATA foram removidos.

Os 44 contêineres preexistentes, imagens, volumes, ZIP, payloads e backup mantiveram os
inventários/hashes no ensaio. A limpeza final removeu os 11 arquivos temporários restantes,
incluindo scripts e logs; sockets, contêiner e PGDATA já estavam ausentes. Permanecem o pacote executável revisado,
os comprovantes agregados e o backup original para a operação autorizada.

**Destino conferido pelo próprio executor às 01:37 UTC:** conexão com TLS e servidor
verificados; transação `REPEATABLE READ READ ONLY` encerrada com `ROLLBACK`. Foram observados
810 PF, 12 inserções previstas, zero IDs V4/aliases V2 encontrados e zero colisões por código,
CPF, RG ou nome. Os grupos duplicados dessas quatro chaves em PF também foram zero. Schema
completo inspecionado igual ao retrato revisado. Essa afirmação está limitada a PF e às chaves
consultadas; não declara ausência de duplicidades nos demais domínios.

Às 01:14 UTC, a consulta separada confirmou as dez migrations ainda pendentes; nenhuma é
dependência física deste lote. Logs/audit não foram renovados nesta etapa. A consulta histórica
de 13/09 continua limitada a campos estruturados e aliases conhecidos e não prova ausência
de exclusões antigas. A decisão de identidade acompanha a aprovação final, sem inferência
automática a partir dos testes.

### Carga exata submetida à autorização

Revisar os [312 valores privados](./dry-run/pf-12/payload.json) e a
[rastreabilidade](./dry-run/pf-12/rastreabilidade.json). A proposta é inserir os 12 PF
ausentes, preservando o dia civil e as transformações documentadas; zero UPDATE, DELETE,
UPSERT, DDL ou migrations. O executor verifica hashes, schema, identidade e colisões novamente
na mesma transação antes do INSERT e compara integralmente os demais PF antes do COMMIT.

A trava `SHARE ROW EXCLUSIVE` pode atrasar temporariamente escritas de qualquer organização
em PF; leituras comuns continuam permitidas. Há espera máxima de dois segundos para locks,
cinco segundos por comando e timeout da transação de 15 segundos. Sem unicidade física nas
chaves de negócio, o procedimento não impede uma duplicata criada por outro escritor após
a liberação da trava. Alterar índices ou o serviço permanece fora deste lote.

O backup preservado corresponde ao snapshot das 00:17–00:19 UTC; não contém escritas
posteriores e tem os limites de recuperação já descritos. Não se propõe apagar automaticamente
os 12 PF depois da carga nem restaurar por cima do banco ativo. Se a resposta ao COMMIT for
incerta, interromper e conferir por leitura antes de decidir qualquer repetição.

A autorização final deve aceitar a identidade/valores propostos, a limitação histórica,
o impacto da trava, o escopo somente de inserções e o snapshot do backup. Será registrada
separadamente com o hash exato de `proposal.json`; `approval.example.json` permanece falso.
O [comando e procedimento completos](./dry-run/pf-12-executor/README.md) estão prontos para
revisão. **Esse era o estado anterior à autorização final. A carga dos 12 PF foi depois
concluída; as dez migrations não foram executadas nessa carga.**

Proposta final SHA-256, conferida novamente com `--describe` após a limpeza:
`5cd328503d70b2b62de2a7933b7c8d7faf28136ca1c8356148b34f6d68fc7deb`.
Os 29 arquivos vinculados mantiveram os hashes esperados; pacote, recibos e backup são
privados e ignorados pelo Git. A preparação não criou aprovação; a autorização posterior foi
registrada, utilizada e arquivada com os recibos de carga. Não houve commit ou push.

### Preparação original preservada

Em `docs/migration/v4.1/dry-run/pf-12/`: `payload.json`, `rastreabilidade.json`,
`aprovacao-datas.json`, `chaves-consulta.json`, `preflight-somente-leitura.json`,
`schema-destino.json`, `schema-ensaio-proposta.sql`, `validacao-contrato.json`,
`preparacao-resumo.json`, `manifesto.json`, `preparar-payload.py` e `validar-payload.mts`.

Referências: [mapeamento](./MAPEAMENTO.md),
[plano](../../superpowers/plans/2026-09-13-migracao-legado-clientes-schema.md),
[schema de cadastro](../../../services/regularize-service/src/schemas/clientPf.schemas.ts),
[serviço PF](../../../services/regularize-service/src/services/clientPfService.ts) e
[normalizador histórico](../v4/scripts/rules/integracao-regularize.mjs).
