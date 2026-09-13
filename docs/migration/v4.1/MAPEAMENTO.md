# Mapeamento V4.1 — deltas sobre a V4

Implementação posterior e delimitada: [ensaio local dos 17 grupos RH](./ENSAIO-RH-2026-09-13.md)
e [carga real autorizada e concluída](./CARGA-RH-PRODUCAO-2026-09-13.md).
O executor aplica G01–G03/R01–R04 somente nesse lote, sem alterar o contrato do banco novo.
Não é implementação de todas as regras abaixo nem autorização para ampliar a carga;
os dez grupos RH em quarentena continuam fora. Cargas posteriores delimitadas: logs e
[lote consolidado de 8.978 registros](./CARGA-INCREMENTO-2026-09-13.md), descrito em H01 abaixo.

## H01 — preservação histórica e controle contábil do incremento

Autorização específica de 13/09: novos históricos de tarefas, Regularize e Contábil podem
ser preservados como cópias técnicas na auditoria existente, sem recriar eventos operacionais.
Somente conteúdo estruturado validado, pai inequívoco na fonte, autor corroborado no tenant,
data civil/fuso/UTC confirmados e identidade estável por tabela/chave. Campos de antes/depois
ficam literais, não são aplicados como alterações atuais. Texto livre não revisado e credenciais
permanecem em quarentena; PEC/Triagem são excluídos inclusive quando identificados em outro domínio.

Identidade: UUIDv5 do namespace histórico sobre
`legacy-history:<tenant>:<sourceTable>:<sourceKey>`, sem digest do backup na chave.
`method=IMPORT`, `activityVisible=false`, `recordKind=legacy_preservation`,
`outcomeScope=technical_preservation`; referência exclusiva de importação, sem FK nativa
inventada, sem usuário executor simulado, sem `changes_json` nem timestamp técnico antigo.

Controles: os 17 indicadores estritos 0/1, competência mensal textual e notas literais são
preservados; cliente exige alias histórico, nome e CPF/CNPJ válido/unívoco, tenant e vínculo
Regularize/Integração comprovados. Coincidência cliente/competência bloqueia INSERT; jamais
atualizar controle existente ou normalizar texto para ocultar divergência.

Resultado fechado: 169 controles e 8.809 históricos carregados. Os 23.680 registros restantes
do recorte continuam fora, com decisão por chave. Não é autorização genérica para outros históricos.

Este é um contrato documental, não um conjunto de regras executáveis. Ler junto com o
[estado e a política de quarentena](./README.md), especialmente D01. Fontes e destinos abaixo
referem-se ao código local; a correspondência dos registros depende da análise do backup de
12/09/2026 já recebido e de reconciliação individual com o banco de destino. A inspeção estrutural
da origem está em [BACKUP-2026-09-12.md](./BACKUP-2026-09-12.md); o inventário inicial autorizado
de metadados e contagens do destino está em [DESTINO-2026-09-12.md](./DESTINO-2026-09-12.md).

## D02 — código atualizado não significa banco atualizado

O destino confirmado é `lfhrkztuqnokijdekjsc`. A inspeção somente leitura de 12/09 encontrou
10 migrations locais ainda não aplicadas e 9 tabelas do Prisma ausentes no banco, incluindo
os novos destinos comerciais. As 72 tabelas históricas de destino V4 existem, mas isso não
comprova compatibilidade de todas as colunas, regras e serviços.

A migration `20260910180000_commercial_task_billing` referenciava `organization`, inexistente;
a tabela real é `organizations`. A referência foi corrigida localmente com autorização e
teste de regressão em memória, sem aplicação ao destino. O
[plano de alinhamento](./PLANO-ALINHAMENTO-SCHEMA.md) registra as etapas restantes e suas
aprovações. Não aplicar migrations, alterar registros ou executar backfills como parte desta
documentação. A divergência de RH em R01 não é resolvida pelas 10 pendências.

As regras abaixo descrevem o contrato pretendido da `develop`, com as diferenças físicas
explicitadas. Nenhum payload dependente de schema ausente está liberado; após eventual
alinhamento, renovar o inventário antes da reconciliação e da carga.

Recorte posterior aprovado: a comparação pode prosseguir sem aplicar o lote de 10 migrations.
A [matriz mínima e os resultados](./RECONCILIACAO-2026-09-12.md) distinguem dependências
condicionais dos destinos novos e estruturas nativas fora da carga. A sondagem já realizada
não promove os candidatos comerciais nem dispensa segurança/compatibilidade do domínio escolhido.

## G01 — tenant e identidade

Usar exclusivamente `e8048d1c-0830-45d7-84de-68e20abd685b`. Mesmo onde o Prisma permite
`organization_id` nulo, a migração Castelo não cria usuário ou entidade sem tenant.
Referências a pais existentes ou candidatos também precisam pertencer a esse tenant.

A correspondência privada terá, no mínimo: tenant, sistema de origem, `source_table`, chave
legada completa, etapa/papel de destino, tabela destino, ID real destino, estratégia de identidade,
evidência da associação, versão da regra, hash do backup e resultado da reconciliação.
Para chave composta ou emissão 1:N, registrar todos os componentes/discriminadores estáveis.
Várias origens podem apontar para um destino apenas quando a associação N:1 for comprovada.

Ordem de resolução:

1. Correspondência aprovada ou comprovante da carga aplicada, conferido no destino atual.
2. IDs derivados por estratégias históricas conhecidas, tratados como candidatos e validados
   por tenant, origem e vínculo. Um ID calculado ausente não prova que o registro seja novo.
3. Se a origem ainda não estiver ligada, confrontar candidatos pelas restrições e evidências
   de negócio. Nome, CPF/CNPJ, e-mail e login ajudam a detectar conflito, mas não autorizam merge.
4. Sem associação inequívoca, registrar impedimento de identidade; não duplicar nem escolher
   o primeiro candidato: encaminhar à quarentena. Se houver evidência de exclusão intencional
   no destino, não recriar automaticamente.

A V4 usa namespace UUID `3f68d246-0b54-4a10-9415-a8845a767fb5`; scripts V2 usam a
string `giro-office:migration:v2:castelo-contabilidade`, com scopes próprios. Não são algoritmos
intercambiáveis. A versão do pacote não muda a identidade; não criar namespace “v4.1”.
Para entidade realmente nova, usar o escopo estável definido na regra correspondente e registrar
a decisão. Novas etapas, como Comercial, precisam ter seu scope aprovado antes de gerar IDs.
Não sintetizar identidade a partir de conteúdo mutável quando falta a chave legada.

Fontes: [contrato V4](../v4/scripts/lib/mapping-contract.mjs),
[runtime V4/V2](../v4/scripts/runtime/v2.mjs) e
[gerador histórico V2](../../../scripts/migration-v2-build-load.mjs).

### G01.1 — identidades verificadas na comparação

A geração declarativa não é suficiente para reconstruir todas as cargas:

- V4 usual: UUID v5 de `sourceTable:chave`, no namespace fixo acima.
- V4 especializado (Tecnologia/Certificados/Parcelamento): UUID v5 de
  `sourceTable:tenant:chave`, conforme o runtime especializado, mesmo em etapas diretas.
- Cargas anteriores de RH/DP, TI e certificados: scopes próprios verificados nos scripts
  históricos; servem como sondagem adicional, não como prova de execução desses scripts.
- V2 textual: SHA-1 da string de namespace para obter os 16 bytes usados no UUID v5.
  Não converter esses bytes para outro namespace nem confundir com a V4.

A comparação cobre 78 etapas de geração direta; 55 outras etapas exigem resolução própria.
Em Regularize, a chave é `codigo`, não `cliente_id`. Não utilizar a heurística `*_id` do
inventário como prova de chave da entidade. Ausência de chave própria/completa continua pendente.
Resultados e limitações estão no [relatório de reconciliação](./RECONCILIACAO-2026-09-12.md).
As estratégias localizadas nessa cópia foram V4 usual e V4 especializada; não criar namespace novo.

## G02 — política de valores sem preenchimento artificial


- Nenhum texto obrigatório ausente recebe `******` na V4.1.
- Não trocar a sentinela por `NÃO INFORMADO`, hífen, login inventado, usuário administrador,
  data atual ou outro valor destinado apenas a passar uma validação.
- Defaults de negócio da V4 não são automaticamente válidos: revisar por campo, sobretudo
  `status = Ativo`, `permission = 0`, `status = Migrado`, responsáveis e datas substituídas.
- Defaults técnicos declarados pelo destino podem ser usados para uma inserção nova quando
  não fabricam fatos do legado, com distinção entre data de importação e data do evento histórico.
- Campo opcional realmente ausente pode permanecer nulo se o contrato aceitar. Campo presente
  mas inválido, ou FK preenchida sem correspondência, exige quarentena com motivo explícito.
- Datas como `0000-00-00`, números inválidos e valores fora do domínio não devem ser convertidos
  em valores aparentemente válidos. Datas de negócio exigem convenção explícita de fuso/conversão.
- Campos classificados como `not_preserved` na V4 continuam no registro de revisão: precisam de
  justificativa semântica vigente, e não podem esconder perda de informação necessária ao destino.

Ausência de campo obrigatório impede um payload apto e encaminha o registro à quarentena, conforme D01.
Não alterar agora registros que já contenham sentinelas no GIRO Office: sua correção seria outro escopo.

## G03 — operações incrementais

| Modo V4 | Interpretação V4.1 |
| --- | --- |
| `insert` | Inserir somente após provar ausência e validar identidade, conteúdo e constraints |
| `merge` | Usar para compor um candidato ainda não persistido; se o destino existe, apenas comparar e preservar |
| `lookup` | Resolver e verificar a referência, sem criar ou atualizar implicitamente |
| `derived` | Derivar somente com evidência, identidade estável e ausência comprovada; não criar pais fictícios |
| `aggregate` | Compor o agregado apenas quando o registro destino é novo; não substituir JSON/arrays existentes |

Um filho em tabela própria pode ser candidato mesmo com pai existente. A emissão deve ser validada
separadamente, incluindo efeitos colaterais. Um item novo dentro de JSON/array de um registro existente
exigiria `UPDATE`: relatar, sem incorporar automaticamente.

O futuro executor precisa reconciliar colisões também entre candidatos do mesmo lote. Um conflito
na aplicação não é sucesso nem pode ser ignorado silenciosamente: reler/verificar ou interromper
o lote conforme política aprovada. `ON CONFLICT DO NOTHING` sozinho não comprova idempotência.
Definir unidades atômicas de pai/filhos: uma emissão necessária inválida coloca o grupo na
quarentena; não aplicar parcialmente a mesma origem. Registros independentes não são bloqueados
apenas por existirem outras origens na quarentena.

O [runner V4](../v4/scripts/lib/migration-runner.mjs) contém cleanup, atualização de colunas e
substituição de agregados. `skipCleanup` não remove as atualizações da fase de carga.
O [backfill Comercial](../../../scripts/commercial-backfill-reconciliation.mjs) também prevê updates
por corte temporal. Nenhum dos dois deve ser executado diretamente como V4.1.

## L01 — revisão da representação existente de logs gerais

Revisão de 13/09/2026, limitada a `tb_admin.logs` → `public.logs`. Mantém o contrato atual;
não altera schema nem regras da aplicação. Resultado em
[carga incremental de logs](./CARGA-LOGS-2026-09-13.md).

- Eventos gerais comprovados `tipo=0/1` com `referente_id=0` mantêm ação/referring originais
  e referência textual `"0"`; não representam uma entidade ausente a ser criada.
- Usar o namespace e scope V4 históricos. Corroborar ator existente conforme G01/U01,
  sem criar usuário nem modificar login, status ou permissão.
- `changes={}` representa ausência de mudança de campos em um evento geral de acesso.
  Não inserir contexto de rede nesse JSON nem fabricar diferenças de negócio.
- Revisão G02 do campo `local`: é hostname/IP obtido por `gethostbyaddr`, não conteúdo
  de alteração de negócio; o destino não tem campo equivalente nem o exige para esse evento.
  Mantém-se fora da projeção nativa, preservado integralmente na evidência privada vinculada
  ao ID e no backup. Essa cobertura parcial de campos na tabela destino deve ser declarada.
- Datas: civil America/Sao_Paulo, instante único, roundtrip no PostgreSQL e projeção UTC
  explícita para o timestamp nativo. Não corrigir convenções de datas já carregadas.
- `tipo=10/11`, autores não corroborados, datas inválidas, referências não gerais,
  coincidências ou ausência antiga sem evidência suficiente permanecem em quarentena.
  Não reproduzir sessões de autenticação, outbox ou notificações do passado.

Fontes: regra V4 `scripts/rules/admin-business.mjs:300`, `workspace2/classes/Painel.php:100`,
`infra/prisma/schema.prisma:452` e `regularizeLogService.ts:26`; contrato real conferido.

## U01 — usuários, colaboradores e autenticação

| Origem / campo | Destino | Regra V4.1 |
| --- | --- | --- |
| `tb_admin.usuarios.id` | `users.id` | Resolver G01; preservar ID existente, mesmo com login alterado |
| `tb_admin.usuarios.user` | `users.login` | Não copiar o login antigo para usuário existente; guardar apenas como evidência privada |
| Nome completo confiável do usuário/colaborador ligado | `users.login`, somente novo | Gerar primeiro nome + último sobrenome + `@castelobranco.com.br` |
| `tb_admin.usuarios.nome` | `users.name`, `users.full_name` | Revisar junto ao colaborador ligado antes de inserir; divergência entre fontes não pode escolher pessoa por aproximação |
| `tb_admin.usuarios.password` | `users.password` | Preservar senha existente; para novo, estratégia de hash compatível e validada, sem senha padrão |
| `cargo`, `status`, `departamento_id` do usuário | `permission`, `status`, `department_id` | Validar tradução e departamento; não herdar defaults que concedam acesso ou ativem sem evidência |
| `tb_rh.colaboradores.user_id` | Referência a `users.id` | Vínculo explícito com `tb_admin.usuarios`; não criar outro usuário pelo nome do colaborador |
| Perfil e `email` do colaborador | Campos opcionais de `users` | Compor somente usuário novo; preservar integralmente perfil já existente |
| Campos técnicos de novo usuário | `version`, `session_version`, `first_owner_flag` | Defaults atuais 1, 0 e false; não transformar importado em proprietário |

Normalização proposta do novo login: usar nome completo ligado à identidade, aparar espaços,
compactar separadores, converter para minúsculas e retirar diacríticos. Escolher primeiro nome
e último sobrenome; nomes insuficientes, abreviações ambíguas e caracteres não cobertos pela regra
ficam em quarentena, sem inventar complemento. Exemplo fictício: `Ana Beatriz de Souza` →
`ana.souza@castelobranco.com.br`.

Havendo colisão, colocar em quarentena; não acrescentar número ou escolher outro sobrenome automaticamente.
Verificar unicidade do login contra candidatos e **todo o destino**: a inspeção confirmou
`users_login_key` e também `users_login_lower_unique`, global e válido, sobre `lower(login)`.
Portanto colisões que diferem apenas por caixa também são impedimentos físicos de inserção.
Essa verificação global deve retornar somente o necessário para detectar ocupação, sem incorporar
dados de outro tenant ao mapeamento. CPF, RG e `permission_id` também possuem unicidade no model.
Qualquer associação a outra organização é impedimento, não autorização para transferir usuário.
Revisar também candidatos que só diferem na normalização de caixa/acentos, sem alterar o login
atual para tornar a associação possível. O índice físico e a identidade lógica são verificações distintas.

O inventário agregado observou 308 usuários Castelo: todos os logins contêm `@`, 305 terminam
em `@castelobranco.com.br` e 3 não. Preservar todos, inclusive os três com outro sufixo.
Esse indicador não valida e-mail nem identidade, e não determina quantos usuários do backup são novos.

O campo usado na autenticação é `login`; `email` é separado. Gerar login não comprova que a caixa
postal exista nem valida o e-mail de contato. Preservar os valores existentes, sem criar sessões,
convites, redefinições de senha ou usuários de plataforma. O serviço atual aceita Argon2id e bcrypt;
não copiar hash desconhecido, re-hashear hash como se fosse senha em claro ou registrar credenciais.
Para novos usuários, permissões e credenciais devem estar coerentes antes da liberação da conta.
Para usuário existente, também não inserir permissões ou vínculos novos que mudem seu acesso:
ser um filho em tabela separada não torna essa alteração compatível com a preservação de permissões.

Fontes: [regra V4](../v4/scripts/rules/v2.mjs),
[Prisma User](../../../infra/prisma/schema.prisma),
[autenticação](../../../services/user-service/src/services/authService.ts) e
[hash de senha](../../../services/user-service/src/security/passwordHashService.ts).

Evidência adicional de 12/09: o login legado compara o campo de senha com a entrada literal
(`workspace2/login.php:85–87`); o cadastro também grava a entrada literal
(`workspace2/classes/Usuario.php:4–6`). Para novos usuários desse fluxo, a transformação deve
gerar hash compatível com `hashPassword` do serviço atual e validar sua verificação em cópia.
Não copiar o valor literal, não gerar senha padrão e não reprocessar senhas dos usuários existentes.
Qualquer origem que não tenha essa proveniência confirmada permanece na quarentena de credenciais.
Nesta etapa apenas se confirmou o caminho de transformação: não foram gerados hashes nem contas.

A análise inicial encontrou dois candidatos que colidem no login proposto. Ambos ficam em
quarentena até decisão explícita; os demais ainda dependem da validação integral prevista em U01.

## C00 — cliente: tipo, modalidade e composição

A validação dos candidatos de 12/09 identificou duas traduções V4 incompatíveis com
o significado dos campos. Corrigir o contrato V4.1; não executar os normalizadores históricos
nem corrigir clientes existentes nesta migração.

| Campo legado | Tradução sustentada na V4.1 |
| --- | --- |
| Integração `tipo = fisico / juridico` | `type = PF / PJ`, respectivamente |
| Integração `tipo_cliente = 1` (Cliente Novo) | `type_registration = Novo`; não determina `status` |
| Integração `tipo_cliente = 2` (Cliente da Casa) | `type_registration = Existente`; não determina `status` |
| Integração `tipo_cliente = 3` (Serviço Único) | `service_unique = true`; modalidade Novo/Existente ainda precisa de evidência |
| Integração `tipo = Constituição de Empresa` | Separar tipo de pessoa de modalidade; não assumir PJ |
| Regularize `situacao = A / I / P` | `Ativo / Inativo / Processo de Inativação`; conferir coerência e competências |
| Regularize `situacao = M` | Significa Sem movimento no legado; equivalência operacional pendente |

Os formulários legados usam nomes de inputs invertidos em relação às colunas; a regra acima
considera as colunas persistidas e o fluxo de cadastro, não só o nome do input.
Evidências: `workspace2/integracao/pages/clientes/cadastrar.php:109,187`,
`workspace2/regularize/pages/clientes/cliente.php:429`,
[cadastro atual de Integração](../../../services/client-service/src/services/clientIntegrationService.ts)
e [normalizadores históricos](../v4/scripts/runtime/v2.mjs).
Na V4, `fisico/juridico` viram `FISICO/JURIDICO`, e `tipo_cliente=1` vira `status=Ativo`:
nenhum desses comportamentos pode ser herdado na nova projeção.

O status de cliente exige composição semântica de Regularize e prospecção. A projeção
comercial atual relaciona `Fechado` a `Ativo`, `Paralisado` a `Paralisado`, recusa a
`Não Contratado` e etapas iniciais a `Prospecção`. Isso é evidência de coerência, não
autorização para resolver divergências por precedência automática ou emitir eventos.
Fonte: [projeção comercial](../../../services/client-service/src/services/clientCommercialProjectionService.ts).

Não usar `PJ`, `Novo`, `false`, data atual ou status genérico só porque existem defaults
no schema/serviço. CPF/CNPJ ausente exige regra de domínio: o cadastro genérico admite
representação vazia, enquanto o de Integração exige documento. Documento presente inválido
continua em quarentena. Documento normalizado ocupado, nome/e-mail coincidente e código
Domínio são indícios de conflito, nunca autorização de merge; nome/e-mail não são uniques
físicos e podem ser compartilhados legitimamente, exigindo revisão de identidade.

Regularize usa `codigo` como chave própria e `cliente_id` como vínculo. Para destino novo,
compor nome/razão social, documento, contato, situação, `dominio_code = codigo` e demais
facetas antes do INSERT. Para existente, preservar. Várias linhas para o mesmo vínculo
não autorizam escolher uma; vínculo quebrado não autoriza criar cliente alternativo.
Confrontar também a contribuição de Instagram de `tb_mkt.redes_sociais` e quaisquer
filhos necessários, sem tratar PA/grupos como obrigatórios apenas por existir o pai.

Datas: `dataAbertura → opening_date`, `inicio_contrato / cliente_desde → customer_since`,
`data_cadastro → register_date_prospecting`, `data_status → date_status` e
`data_fechamento → closing_date`. `data_cadastro` é **DATETIME**, os demais campos citados
são datas civis no legado. Validar o tipo real antes de classificar o formato.
Fuso/conversão histórica continuam pendentes. Competência mensal também precisa de regra:
a V4 usa início do mês, mas o [distrato atual](../../../services/client-service/src/services/clientTerminationService.ts)
usa o último instante UTC do mês. Não trocar essas convenções silenciosamente.

Resultados e limites do diagnóstico parcial em
[VALIDACAO-CANDIDATOS-2026-09-12.md](./VALIDACAO-CANDIDATOS-2026-09-12.md).

## C01 — prospecção comercial

A V4 mapeia `tb_integracao.prospeccao_comercial` para uma faceta de `clients` e um projeto.
O código/Prisma atual prevê também `commercial.prospecting`, ainda ausente no banco consultado.
O novo destino é candidato semântico para a prospecção, mas não autoriza duplicar a faceta,
criar projetos novamente ou replay de eventos.

| Origem | Destino candidato | Transformação/restrição |
| --- | --- | --- |
| `id` | `commercial.prospecting.id` | Resolver correspondência e estratégia histórica; não presumir ID V4 ou do backfill |
| `cliente_id` | `client_id` | Resolver `tb_integracao.clientes` → ID real do cliente Castelo |
| Tenant da carga | `organization_id` | Constante Castelo; confirmar tenant do cliente |
| `situacao` | `status` | Estado do fluxo legado; validar contra o domínio atual do Comercial |
| `data_status` | `status_date` | Data válida ou ausência legítima; não mascarar data inválida |
| `status_prospeccao` | `description` | Texto livre de acompanhamento; preservar até o limite do serviço, sem truncar ou usar como enum |
| `solucao` | Sem campo direto na nova entidade | Categoria de solução no legado, não descrição; revisar destino/decisão explícita de não preservação |
| `data_cadastro` | `registered_at` | Preservar data válida; falta de evidência histórica exige decisão, não substituir pela data do backup |
| Metadado técnico da importação | `updated_at` | Data técnica explicitamente identificada; não representa atualização feita no legado |

O catálogo atual admite `Análise Financeira`, `Análise/Agendamento`, `Envio de Proposta`,
`Paralisado`, `Recusado pelo Cliente` e `Fechado`. O formulário legado também admite `Baixada`,
`Inativo` e `Distrato`: sem correspondência atual aprovada, vão para quarentena, sem converter
para `Fechado`. O comando de UI `Fechado SE` normalmente é persistido como `Fechado` pelo legado;
se aparecer literalmente no backup, revisar a anomalia em vez de reproduzir o comando.
Existe unicidade por `organization_id + client_id`; várias prospecções para um cliente exigem
regra de resolução/histórico, não “última linha vence”. Confrontar também a faceta do cliente.
Se criar a nova entidade exigir corrigir campos de um cliente existente para manter coerência,
relatar a incompatibilidade e não aplicar parcialmente sob a política sem updates.

Evidência decisiva: o formulário legado usa select de situação e input textual de
`status_prospeccao`; a listagem mostra esse texto na coluna de observações. O runtime V4 e o
backfill Comercial de referência não substituem essa evidência. Para **novo cliente**, a faceta
também deve ser revista para `situacao` → `clients.prospecting_status` e
`status_prospeccao` → `clients.description_prospecting`, com o mesmo conteúdo semântico da
prospecção. Para cliente existente, apenas comparar e preservar; divergência vai para quarentena.

As colunas antigas `participantes`, `modo_reuniao`, `data_fechamento` e `ramo` continuam
associadas à faceta do cliente na revisão; não possuem equivalência automática na nova entidade.
O projeto legado usa ainda `servico`, `situacao`, `porcentagem` e as datas: reconciliar a emissão
de projeto separadamente e revisar seus defaults pela G02. Reavaliar também o antigo preenchimento
de `objective` por `solucao`: uma categoria de solução não comprova objetivo de projeto.
Descrição acima de 5.000 caracteres fica em quarentena; não truncar para satisfazer o serviço.

Não disparar transições normais do serviço, e-mails ou efeitos de outbox para reproduzir histórico.
Reconciliação de projeções necessárias deve ser explicitamente desenhada e testada antes da carga.
Fontes: [regra V4](../v4/scripts/rules/v2.mjs),
[contrato do Comercial](../../../services/commercial-service/README.md),
[schema de entrada](../../../services/commercial-service/src/schemas/prospecting.schemas.ts),
[backfill de referência](../../../scripts/commercial-backfill-reconciliation.mjs).
Evidências no checkout legado `25b1101`: `comercial/pages/prospeccoes/editar.php:162`,
`comercial/pages/prospeccoes/editar.php:187`, `comercial/pages/prospeccoes/prospeccoes.php:644`
e `classes/Prospeccao.php:32`.

## C02 — tarefas e cobrança comercial

- `tb_integracao.tarefas` continua candidata a `integracao.tasks`, com as etapas separadas
  de lookup/derivação de modelo e projeto da V4. Cada destino passa por G01–G03.
- `Task.responsible_id` passou a opcional no Prisma, mas ainda é `NOT NULL` no destino.
  A flexibilização depende da migration pendente. Só permitir nulo para ausência legítima compatível
  com o serviço, nunca para esconder responsável legado preenchido e não resolvido.
  `TaskModel.responsible_id` continua obrigatório: não generalizar a flexibilização.
- O índice SQL previsto `uq_tasks_active_org_project_model`, ainda ausente no destino, proíbe duplicidade por
  `(organization_id, project_id, model_id)` nos status `Em Andamento`, `Em andamento`,
  `A Realizar` e `Em Espera`. Conferir existentes e candidatos mesmo quando seus IDs diferem.
  Não mudar status, modelo ou projeto apenas para evitar a colisão.
- `commercial.task_billing`, ainda ausente no destino, exige `task_id` único globalmente,
  tenant e `hiring_status` no contrato local.
  `payment` e `billing_description` são opcionais. A tarefa e seu cliente/projeto precisam
  estar ligados corretamente dentro do tenant. Ausência da cobrança pode permitir um novo filho,
  desde que não seja necessária atualização incompatível da tarefa existente.
- As origens `tb_integracao.cobrancas_novas`, `tb_integracao.tarefas_contratadas` e
  `tb_comercial.cobrancas_descricao` permanecem **pendentes de uma regra completa**, com
  correspondências parciais comprovadas abaixo. O backfill recebe uma entrada já normalizada;
  ela não substitui a reconstrução da semântica de contratação no legado.
- `tb_integracao.cobrancas` é um rótulo usado pelo backfill, não uma origem presente nas
  312 evidências V4. Não inventar essa tabela no inventário. `tb_integracao.cobrancas_solucoes`
  continua com a ressalva histórica de ausência de referência executável no legado.

| Origem física verificada | Destino candidato / decisão |
| --- | --- |
| `tb_comercial.cobrancas_descricao.tarefa_id` | `commercial.task_billing.task_id`, via correspondência de `tb_integracao.tarefas.id` |
| `tb_comercial.cobrancas_descricao.pagamento` | `payment`; texto até 255 caracteres, domínio legado conhecido e ausência legítima |
| `tb_comercial.cobrancas_descricao.descricao` | `billing_description`; texto até 5.000 caracteres, sem truncamento |
| `tb_comercial.cobrancas_descricao.id` | Identidade/evidência da contribuição; não gerar várias cobranças para a mesma tarefa |
| `tb_comercial.cobrancas_descricao.usuario`, `data` | Proveniência da informação; não confundir usuário/data do evento com metadados técnicos da importação |
| `tb_integracao.cobrancas_novas.id`, `tarefa_id` | Fila operacional de solicitação de cobrança, não valor ou situação de pagamento |
| `tb_integracao.tarefas_contratadas.id`, `tarefa_id`, `data`, `user_id` | Referência histórica a tarefa; presença isolada não comprova estado atual de contratação |
| `tb_integracao.tarefas.cobranca`, `estado` e evidências relacionadas | Insumos para reconstruir `hiring_status`; não há conversão isolada aprovada nesta versão |

O serviço atual admite `A Realizar`, `Contratado` e `Não Contratado` para `hiring_status`.
O formulário legado usa `Em andamento` para a opção “Contratado”, mas o código também pode
colocar a tarefa em andamento por fechamento da prospecção, ainda com `cobranca = 2`.
Portanto `estado = Em andamento` sozinho **não** comprova contratação. Até uma regra contextual
completa, os candidatos sem contratação inequívoca ficam na quarentena.

O legado insere descrições sem uma regra local de substituição e consome a fila financeira
apagando sua entrada. Não deduzir “pago”, “não pago” ou “contratado” pela presença/ausência na fila.
Múltiplas descrições por tarefa precisam de resolução histórica; não escolher arbitrariamente
a primeira/última, nem perder `usuario`/`data` sem decisão de preservação auditável.

Fontes: [Prisma](../../../infra/prisma/schema.prisma),
[índice de tarefas ativas](../../../infra/prisma/migrations/20260906194000_enforce_active_task_model_uniqueness/migration.sql),
[evidências legadas](../v4/scripts/evidence/integracao-regularize.mjs),
[contrato de cobrança](../../../services/commercial-service/src/schemas/taskBilling.schemas.ts).
Evidências no checkout legado `25b1101`: `classes/Tarefa.php:852`, `classes/Tarefa.php:1067`,
`comercial/pages/cobrancas/cobrancas.php:119` e `financeiro/ajax/cobrancas.php:57`.

## C03 — configuração de proposta

O Prisma e a migration local preveem renomear `proposal.config.minimum_wage` para
`contract_value`; o banco consultado ainda possui `minimum_wage`. A unicidade prevista por
`(organization_id, name)` também não está aplicada. Uma eventual nova configuração requer nome,
valor válido e identidade auditada; preservar a configuração existente mesmo se o legado divergir.

Não há regra confirmada V4 para esse destino. A revisão local identificou
`tb_cbc.configs.valor`, filtrado por `referente = 0`, como **salário mínimo** usado nas propostas
legadas. A tabela contém `id`, `referente` e `valor`, sem um nome de configuração equivalente
ao contrato atual. O contrato normalizado `legacy.proposalConfigs` do backfill não resolve essa lacuna.

A equivalência monetária continua pendente: renomear coluna no destino não comprova que
“salário mínimo” legado seja valor de contrato. Não converter `referente` em nome artificial nem
copiar `valor` para `contract_value` sem confirmar finalidade, unidade e regra de conversão monetária.
Registros candidatos sem essa tradução validada ficam na quarentena de mapeamento.
Não criar configuração nem copiar valores por semelhança de nome.

Fontes: [rename](../../../infra/prisma/migrations/20260910150000_proposal_config_contract_value/migration.sql),
[unicidade](../../../infra/prisma/migrations/20260909130000_proposal_config_name_uniqueness/migration.sql).
Evidências no checkout legado `25b1101`: `integracao/pages/configuracoes/propostas.php:13`
e `classes/Configs.php:8`.

## R01 — solicitação RH: responsável incompatível com a regra antiga

`tb_rh.solicitacoes.atribuido` é resolvido pela V4 através de `tb_rh.colaboradores` até
`users.id`, com `0`, vazio ou ausente convertidos em nulo. Entretanto, o Prisma de referência
declara `RhRequest.assigned_to_user_id String`, sem `?`, embora a relação `assigned_to` use `User?`.
No inventário inicial, o teste V4 de catálogo esperava anulabilidade e falhava nesse ponto,
evidenciando uma inconsistência preexistente entre os contratos locais. A leitura do destino confirmou que a coluna física
é anulável: 668 das 910 solicitações RH do Castelo possuem responsável nulo. Esses registros
existentes devem permanecer intactos; não preencher responsáveis nem impor `NOT NULL` para
satisfazer o arquivo local. As 10 migrations pendentes não resolvem essa divergência.

Atualização posterior autorizada: o projeto agora representa o escalar como `String?` e
aceita `string | null` no tipo de acesso de mensagens, sem alterar as condições de autorização.
Catálogo 7/7, testes RH 164/164 e typecheck aprovados; leitura histórica real verificada apenas
na cópia local. Não houve DDL nem preenchimento de responsáveis no destino real.
As regras operacionais de criação/atualização continuam exigindo responsável. Ver
[preflight e limites do ensaio](./PREFLIGHT-2026-09-12.md).

Regra V4.1 vigente, após aprovação explícita do responsável na conversa:

- Somente na importação histórica do Castelo, `atribuido=0` comprovado na origem pode ser
  preservado como `assigned_to_user_id=null`, sem inventar uma pessoa. No diagnóstico,
  aceitar apenas o literal `"0"` ou o número `0`, sem coerção de outros valores.
- Campo ausente, nulo, vazio ou referência inválida/não resolvida continua em quarentena.
  Não converter esses casos em zero nem usar a exceção como fallback de FK.
- Autoatribuição continua em quarentena. Nenhuma alteração nas regras operacionais do
  aplicativo, nos responsáveis existentes ou nas permissões.
- O diagnóstico registra a regra `R01_ZERO_COMPROVADO_PRESERVAR_NULO`, sem gerar payload.
  A exceção remove somente o bloqueio de responsável ausente nos casos comprovados;
  `eligibleForInsert` e `contentValidated` continuam falsos até validação integral.

Antes de liberar esse fluxo, revisar as demais evidências por registro. Mesmo com a regra
histórica de nulo aprovada ou responsável válido, validar requerente, categoria e todas as
demais referências. A reconciliação do requerente usa colaborador → usuário, não igualdade de IDs
entre `tb_rh.colaboradores` e `tb_admin.usuarios`.

Fontes: [Prisma](../../../infra/prisma/schema.prisma),
[regra RH](../v4/scripts/rules/rh-pessoal.mjs),
[teste divergente](../v4/scripts/test/prisma-catalog.test.mjs).

Diagnóstico posterior dos 27 candidatos: 21 têm `atribuido=0`; os seis restantes resolvem
responsável e requerente para o mesmo usuário. Nenhum foi liberado. O código legado confirma
que zero significa não atribuído (`workspace2/classes/Solicitacao.php:160,243`); não é motivo
para escolher uma pessoa automaticamente. A exceção de preservar esse estado como nulo em
uma nova importação histórica foi aprovada posteriormente na conversa. Não muda as regras de
criação do aplicativo, não atribui ninguém e não libera as demais validações. A autoatribuição dos seis
casos continua em quarentena. Evidências em [VALIDACAO-RH-2026-09-12.md](./VALIDACAO-RH-2026-09-12.md).

Para futuras projeções, as codificações comprovadas são: status `0/1/2/3` →
`New/In_Progress/Resolved/Closed`; urgência `1/2/3` → `Low/Medium/High`. Sem fallback para
valores desconhecidos. Cadastro, atualização e envio usam PHP `date()` com
`America/Sao_Paulo`, gravados como DATETIME sem fuso. A conversão temporal deve preservar
esse contexto e ser ensaiada; não interpretar automaticamente o texto como UTC só por causa
do `SET time_zone` do dump. O horário de atualização não cobre toda atividade: mudanças
isoladas de status/leitura podem não alterá-lo. Não sintetizar a data a partir da última mensagem.

## R02 — mensagens RH: tipos, leitura e arquivos

A semântica está em `workspace2/classes/Solicitacao.php:255–299`. A V4 não pode ser usada
diretamente: seu runtime trata tipo `2` como Solution, `3` como Rejection e usa default
Message para `1`, `5`, `6`, diferindo do legado.

| Tipo legado | Significado | Tratamento V4.1 |
| --- | --- | --- |
| `0` | Mensagem | `Message`; tipo original no snapshot R03 |
| `1` | Solução | `Solution`; estado original pendente de resposta no snapshot |
| `2` | Solução recusada | `Solution`; estado `rejected` e tipo original no snapshot |
| `3` | Resposta da solução recusada | `Rejection`; preservar autor e texto da resposta |
| `4` | Solução aceita | `Solution`; estado `accepted` e tipo original no snapshot |
| `5` | Resposta da solução aceita | `Acceptance`; preservar autor e texto da resposta |
| `6` | Arquivo | `Message`; nome legado intacto no corpo, `attachment` depende de binário/referência válida |

Mapeamento complementar aprovado na conversa: os tipos 2/4 continuam sendo a solução
original, não a resposta. Conservar essa distinção, tipo bruto, leitor e originais na auditoria
existente, conforme R03. Não deduzir `replyTo`, autor ou horário do aceite/recusa: o legado
pode alterar várias soluções de uma vez e não oferece vínculo individual de resposta.
No tipo 6, preservar o nome bruto sem inventar descrição; só preencher `attachment` após
validar o binário e uma referência utilizável pelo destino. O legado guarda arquivos em
`uploads/Rh/solicitacoes/`; textos comuns passam por `nl2br`, exigindo revisão de HTML
quando presente. Fonte: `workspace2/rh/ajax/solicitacoes.php:212`.

`remetente` e `destinatario` são IDs de colaboradores. **Destinatário registra quem leu**:
nasce zero e é preenchido junto com `lida=1`. Não é derivado dos participantes da solicitação,
como justificava a V4. O destino tem `is_read`, mas não campo equivalente ao leitor; a
preservação dessa informação preenchida foi aprovada no snapshot técnico R03; não a omitir.
Mensagem não lida com destinatário zero não possui leitor a inventar ou descartar.

Importar pedido e suas mensagens necessárias como grupo validado. Não chamar o serviço
normal de criação de mensagens para reproduzir histórico: ele atualiza a solicitação, mesmo
para Message, e pode substituir status/data. Não executar PHP legado ou carregar seu chat:
a própria leitura marca mensagens como lidas. Preservar o estado final armazenado, sem
replay de notificações/transições. Os 41 filhos dos 27 candidatos continuam em quarentena;
filhos de solicitações existentes não foram incluídos neste recorte.

## R03 — preservação técnica de mensagens e histórico na auditoria existente

O responsável aprovou registros técnicos complementares na auditoria já existente e reforçou
que as regras do banco novo devem ser mantidas. Não alterar schema, constraints, enums,
permissões, services, dashboard ou chat. Nenhuma aprovação de carga decorre deste mapeamento.

Usar **um snapshot técnico por pedido e backup**, em `audit_requests`, para preservar pedido,
mensagens e as linhas originais de histórico como objetos/arrays em `metadata_json`.
Não transformar cada linha antiga em um evento HTTP nem atribuir sucesso técnico ao ato legado.

| Campo do destino | Convenção de preservação |
| --- | --- |
| `request_id` | `legacy-rh:snapshot:<tenant>:<sourceDigest>:<id-pedido-origem>`; única e estável por captura, não é o ID do pedido |
| `organization_id` | Tenant Castelo confirmado |
| `referring` / `referring_id` | `RhRequest` / ID validado do novo pedido; vínculo deve ser conferido, pois não possui FK |
| `method` / `action` | `IMPORT` / `legacy.rh.snapshot.preserved` |
| `path` / `service_source` | `/imports/legacy/rh/requests/<id-origem>` / `legacy-rh-import`; caminho lógico, não alegação de requisição passada |
| `outcome` | `success` somente após preservação técnica efetivada; nunca interpretar como resultado da operação antiga |
| `created_at` | Instante real da futura preservação técnica; datas antigas ficam no JSON, sem substituir uma pela outra |
| `user_id` | Ator técnico real e validado, quando houver; caso contrário nulo permitido pelo contrato. Não usar o autor antigo como executor da importação |
| `department` | `RH` |
| `changes_json` | Nulo; snapshot não é alteração `from/to` executada no aplicativo |
| Contexto desconhecido | `permission`, `status_code`, IP, duração, origem HTTP e campos similares nulos; sem defaults artificiais |

O objeto `metadata_json` deve incluir:

- `activityVisible: false` no topo, para não publicar preservação como atividade operacional;
- `recordKind: "legacy_preservation"` e `outcomeScope: "technical_preservation"`;
- versão, instância `castelo-legado`, identificação/hashes da captura e tabelas de origem;
- `legacy.request`, `legacy.messages` e `legacy.history`, preservando todos os campos brutos;
- links com namespaces explícitos: colaborador → usuário legado → usuário do destino para
  participantes/leitor; usuário legado → usuário do destino para atores de histórico;
- interpretações separadas dos brutos: tipo de mensagem, estado da solução, datas UTC e
  fuso original, referência dos anexos e campo real de atribuição quando o legado o rotula errado.

No histórico, selecionar exclusivamente `tb_historico.rh.tipo=19` e `item_id` do pedido.
`referente` é parâmetro de tela, não coluna dessa tabela. Guardar ID, tipo, data, antes,
depois, campo, observação, ator e item originais. Quando `campo='status'` e
`obs='Atualização do Atribuido da Solicitação'`, interpretar antes/depois como colaboradores,
sem reescrever os campos brutos. Zero nesse histórico é informação de não atribuído, não
autorização para criar usuários ou ampliar R01. Preservar inclusive linhas sem diferença;
não gerar eventos ausentes de aceite/recusa a partir do estado final.

Essa informação é recuperável pela auditoria organizacional conforme suas permissões atuais,
mas não aparece automaticamente no chat nem no componente visual de alterações. A consulta
organizacional exige administração geral; não conceder novas permissões para expor os extras.

Fontes: `workspace2/classes/Historico.php:799,1056`, `classes/Solicitacao.php:243–299`,
[contrato da auditoria](../../../services/audit-service/src/services/auditRequestService.ts),
[persistência da auditoria](../../../services/audit-service/src/integrations/prisma/auditRequestRepository.ts),
[filtro de atividades](../../../services/gateway/src/services/dashboardStatsService.ts).

## R04 — datas, identidade e conclusão do diagnóstico do lote RH

Datas civis do legado são interpretadas em `America/Sao_Paulo`. A validação testa um único
instante possível, sem aceitar horário inexistente/ambíguo em transições de fuso e sem fallback.
Conferir o instante e a volta ao valor civil no PostgreSQL local. Para os campos nativos
`timestamp(3) without time zone` do projeto, projetar a representação UTC coerente com o uso
de `Date`/ISO do aplicativo; não depender do fuso da sessão SQL. Preservar também valor bruto
e fuso no snapshot. Não corrigir datas de registros já existentes, mesmo que cargas antigas
tenham usado outra convenção. Referência técnica: [AT TIME ZONE no PostgreSQL 17](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT).

IDs históricos localizados precisam de corroboração de identidade do usuário por nome e
login esperado ou CPF válido, sem ignorar CPF conflitante e sem alterar o login atual.
Categoria é corroborada pelo campo legado `categoria`, não por um inexistente `nome`.
Comparar candidatos com o conteúdo do destino, incluindo título, descrição, dono e datas
civil/UTC, além dos IDs. Coincidências não promovem merge ou INSERT automaticamente.
Conferir atores, cadastro único do histórico, cronologia e mensagens como grupo. Uma ausência
de resultado em logs/auditoria não prova que jamais houve exclusão; candidatos antigos ou
com coincidência relevante continuam em quarentena para revisão específica.

O [validador local](./scripts/validate-rh-local.mjs) usa os hashes fixados, socket isolado e
transação somente leitura. `SEM_IMPEDIMENTO_IDENTIFICADO_NESTA_VALIDACAO` significa que
as checagens deste recorte passaram, não que já exista payload, ensaio ou autorização de carga.
Detalhes e limites ficam em [VALIDACAO-RH-2026-09-12.md](./VALIDACAO-RH-2026-09-12.md).

## Q01 / P01 — quarentena e decisões de domínio

| Domínio/origem | Tratamento a preservar ou revisar |
| --- | --- |
| Tecnologia: senhas sem `password` | Exclusão operacional histórica; não fabricar senha |
| Tecnologia: `tb_tecnologia.reset` | Não migrar resets históricos como operações atuais |
| Tecnologia: solicitante/referência ausente | Revisar fallback antigo de usuário padrão; não atribuir a administrador para satisfazer FK |
| Certificados PJ/PF | Validade inválida e conflito de identidade única impedem emissão apta; manter referência do motivo |
| Certificados: arquivos e senhas | Nome de arquivo não é objeto válido no storage; validar envelope/compatibilidade de criptografia sem expor segredos |
| Parcelamento | Reavaliar completude real de serviço, identidade e campos; regras V4 não provam liberação das cargas historicamente suspensas |
| RH/DP | Revalidar referências por identidade; não reproduzir exceção antiga de cliente duplicado por `dominio_code` sem evidência atual |
| PEC: `tb_pec.notas` e `tb_admin.permissoes_pec` | Quarentena operacional integral do recorte por decisão de 13/09: módulo `pec` aposentado no sistema atual. Excluir `pec-note-insert`; não usar a tabela residual `notes` como aprovação, não remapear para tarefas/auditoria nem alterar existentes |
| Demais pendências V4 | Preservar origem e motivo; revisar sem promover por nome parecido com model novo |

PEC: 1.489 notas e três permissões no recorte dos 32.658. A decisão substitui a avaliação
preliminar de 630 notas condicionais; todas ficam fora. Evidências e registro por chave no
[plano do incremento](./PLANO-INCREMENTO-32658-2026-09-13.md).

As contagens antigas de quarentena não são contagens da V4.1. Um registro em quarentena histórica
pode voltar à revisão se houver dados corrigidos e regra validada, sem apagar seu histórico.
Ausência no novo backup não significa ordem de exclusão do destino.

Fonte: [decisões operacionais históricas](../README.md). Nenhuma tabela deixou de ser pendente
nem saiu de quarentena por esta documentação.

## N01 — tabelas nativas e efeitos operacionais

Não popular automaticamente sessões de usuário/plataforma, outbox, notificações de e-mail,
eventos/projeções operacionais, configurações de relatórios e confirmações de wizard a partir
de tabelas legadas com nome semelhante. Model novo exige origem e regra semântica próprias.
Antes da aplicação futura, inventariar triggers, workers e rotinas que reajam a novos registros;
“só INSERT” não garante sozinho ausência de atualização indireta ou envio de mensagens.

## Leitura do inventário

O CSV é a fotografia do catálogo V4 no commit informado no README, não uma lista de aprovados V4.1.
`regra_base` aponta para o arquivo de transformação por campo; `destinos_v4` enumera
`stepId:destinationTable:mode`. `revisoes_v41` marca deltas desta especificação:

- `REVALIDAR_INCREMENTAL`: há regra V4; aplicar G01–G03 e revisar com dados reais.
- `SEM_MAPEAMENTO_VALIDADO`: evidência V4 pendente; falta confirmar destino/semântica.
- `U01`, `C01`, `C02`, `C03`, `R01`, `Q01`, `P01`: revisões específicas descritas acima.

Todas as linhas exigem validação dos registros da fonte de 12/09/2026 e do estado real do destino.
A compatibilidade estrutural inicial da fonte não confirma o mapeamento semântico nem libera
registros da quarentena. C03 identifica uma origem candidata já inventariada, sem confirmar
equivalência; N01 não cria origens fictícias.
