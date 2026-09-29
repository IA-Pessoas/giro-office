# Pesquisas mensais de uso de IA — Especificação

Issue: [#1545](https://github.com/IA-Pessoas/giro-office/issues/1545)

## Objetivo

Permitir que a equipe registre e consulte, por organização, usuário e competência mensal, as respostas do controle legado de uso de IA. A mesma fonte alimenta relatórios de pendências e o indicador de conhecimento no dashboard Marketing.

## Escopo

- Criar um controle individual ou em lote para usuários ativos da organização na competência escolhida.
- Impedir mais de um controle por usuário e competência, inclusive em tentativas concorrentes.
- Preservar as perguntas legadas: conhecimento de ChatGPT, integração, frequência de 1 a 10, finalidade e ganho percebido. Respostas ausentes continuam nulas e visíveis como pendentes.
- Consultar e responder controles, filtrar por competência e apresentar relatórios de controles sem resposta e usuários sem integração.
- Importar somente registros com vínculo inequívoco entre usuário e competência; encaminhar ambiguidades para reconciliação sem inventar identidade ou competência.
- Restringir operações à organização autenticada e à permissão existente de Marketing.
- Ativar os caminhos Marketing necessários no gateway e na página protegida, sem redesenhar o shell existente.

Não inclui as demais entregas das issues #1546–#1548, nem importação de outros domínios Marketing.

## Modelo e regras

Alvos unitários também precisam estar ativos e vinculados à organização diretamente ou por departamento.

Adicionar `MarketingAiUsageControl` no schema Prisma usado pelo `marketing-service`, com organização, usuário, competência (primeiro dia do mês) e as cinco respostas opcionais. A frequência aceita inteiros de 1 a 10. Índice único em organização, usuário e competência será a garantia final de não duplicidade. Usuário e competência devem pertencer à organização do registro.

Campos sem resposta ficam `NULL`; não converter ausência em `false`, zero ou texto vazio. Um controle está pendente enquanto qualquer resposta estiver ausente. “Sem integração” conta apenas resposta explícita `false`; resposta ausente permanece pendente e não é inferida.

A criação unitária repetida retorna conflito. A criação em lote inclui usuários ativos e ignora conflitos já existentes, retornando quantidades criadas e já existentes. O lote deve permanecer limitado à organização autenticada.

O dashboard conta conhecimento sem resposta na competência corrente calculada pelo fuso da organização. Consultas de relatório recebem competência explícita e não misturam organizações.

## API e interface

Adicionar rotas no `marketing-service` para listar usuários elegíveis, criar um controle, criar em lote, consultar controles por competência, atualizar respostas e consultar resumo de pendências. Leitura exige permissão de visualização Marketing (nível 1); mutações exigem permissão de edição (nível 2). Validar body e parâmetros com Zod; derivar organização e permissão da sessão encaminhada, nunca de `organization_id` fornecido pelo cliente. Usar as respostas de sucesso/erro já padronizadas no serviço.

Estender o dashboard Marketing com o indicador de conhecimento pendente e acrescentar a tela de pesquisas dentro do módulo Marketing existente. A interface terá competência, criação unitária/lote, lista, edição de respostas e estados reais de carregamento, erro, vazio e duplicidade. Preservar os padrões visuais e componentes do dashboard existente.

## Importação e reconciliação

Criar importação determinística a partir de export legado validado. O mapeamento exige associação explícita a um usuário canônico e competência mensal válida; nenhum pareamento somente por nome, e-mail ou semelhança será aceito. Linhas sem correspondência única, com competência inválida ou conflitante serão emitidas como itens de reconciliação, sem gravar parcialmente como se fossem confirmadas. A importação será idempotente pelo índice único e preservará a origem legada para rastreabilidade.

A documentação do repositório lista `tb_mkt.controle_ia` com colunas `usuario_id`, `competencia`, `conhecimento`, `integracao`, `frequencia`, `motivo` e `agregacao`, mas marca a tabela como `NO_CURRENT_CONTRACT`; também registra 79 linhas em quarentena. Nenhum arquivo de export está disponível no worktree. Portanto, a implementação deve fornecer o importador e testes com fixtures sintéticas, sem executar carga real nem reclassificar a quarentena histórica.

## Segurança e autorização

Todas as rotas exigem autenticação e permissão Marketing existente. A organização vem exclusivamente do contexto autenticado. Leituras, criações em lote, gravações e relatórios sempre filtram organização no serviço. Nunca expor dados de outra organização nem aceitar identificadores de organização arbitrários.

## Verificação

- Testes unitários para normalização da competência, respostas pendentes, frequência, regras de duplicidade e importação/reconciliação.
- Testes de rotas para autenticação, permissão, isolamento organizacional, criação unitária/lote, consulta, atualização e relatório.
- Testes para indicador do dashboard com conhecimento nulo e competência/fuso da organização.
- Testes do gateway/OpenAPI/smoke cobrindo as rotas ativadas.
- Testes de interface para criação, resposta, pendência, carregamento, erro e vazio; smoke real no navegador com screenshots em `output/playwright/`.
- Lint, typecheck, testes escopados, cobertura do smoke e build dos pacotes afetados.

## Riscos e limites conhecidos

- O esquema SQL e os tipos exatos das respostas legadas não têm contrato validado no repositório. O importador deve validar seus dados e colocar valores incompatíveis em reconciliação.
- A fonte de 79 registros históricos não está presente localmente. É possível provar regras do importador com fixtures; a carga real e a reconciliação dos registros dependem de export validado.
- O gateway bloqueia hoje todos os caminhos `/marketing`; ativá-los exige atualizar testes de bloqueio e políticas, preservando os demais controles de permissão.
