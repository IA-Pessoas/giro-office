---
name: rodar-office
description: Use quando o usuário pedir para rodar o Giro Office localmente para testar alterações, identificar quais serviços correspondem aos arquivos modificados ou escolher quais serviços levantar. Não se aplica a deploy na VPS.
---

# Rodar Office

Prepare o ambiente de desenvolvimento do Giro Office com **UI + base** e os
serviços necessários à tarefa. Responda em português. Sugira o conjunto e aguarde
confirmação antes de instalar dependências, compilar ou iniciar processos.
A base entra na proposta automaticamente; o usuário não precisa conhecer nomes
internos. Esta skill utiliza comandos existentes, não instala um supervisor.
O trabalho principal é mapear **arquivo alterado → pacote/serviço → conjunto de
teste**. Se o escopo não puder ser inferido, pergunte quais serviços ou
funcionalidades o usuário quer testar; não exija criar um novo orquestrador.

## 1. Descobrir o ambiente e a tarefa

- Localize a raiz do checkout atual por `package.json`, `pnpm-workspace.yaml`,
  `app/` e `services/`. Resolva caminhos a partir dela, nunca de um caminho fixo.
- Leia `AGENTS.md`, regras aplicáveis e scripts dos pacotes selecionados. Use o
  Graphify conforme as regras locais; sem grafo, faça descoberta manual.
- Confirme que o destino é a máquina de desenvolvimento. Se a sessão estiver na
  VPS ou o destino for ambíguo, esclareça antes de executar a stack. Instalar esta
  skill na VPS não lhe dá acesso à máquina do usuário.
- Considere a intenção da conversa, os arquivos realmente alterados (incluindo
  arquivos novos e staged) e as dependências HTTP do fluxo. Um diff vazio não
  significa ausência de trabalho; mudanças em `shared`, schema ou lockfile
  podem afetar vários serviços. Não atribua arquivos de outras tarefas à atual
  sem evidência.
- Inspecione versões de Node/pnpm, dependências instaladas, portas e processos
  relevantes. Reutilize um processo somente após verificar checkout, comando,
  modo e compatibilidade com o código atual. Porta aberta sozinha não basta.
- Confira configuração local por nomes/presença de variáveis e destinos, sem
  imprimir credenciais. Banco, autenticação e serviços externos devem ser os
  já destinados a desenvolvimento; não substitua por configuração de produção.

### Associar arquivos aos serviços

Leia [references/selecionar-servicos.md](references/selecionar-servicos.md) e
produza o mapeamento antes de decidir o conjunto. Use o caminho e o manifest do
pacote como evidência de pertencimento; use chamadas e imports para dependências.
Mostre os arquivos relevantes agrupados por serviço e marque separadamente as
dependências inferidas. Mudança compartilhada indica impacto possível, não uma
ordem para iniciar todos os serviços.

Quando o resultado for vazio, amplo demais ou ambíguo, pergunte diretamente:
“Além de UI e base, quais serviços ou funcionalidades você quer testar?” Ofereça
as sugestões que tiver e aguarde. Aceite nomes de telas/domínios e traduza-os
para os pacotes reais; o usuário não precisa listar nomes técnicos.

## 2. Montar e confirmar a proposta

| Grupo | Seleção padrão | Modo |
| --- | --- | --- |
| UI | `app` | Script `dev` do pacote |
| Base | `gateway`, `client-service`, `audit-service`, `user-service`, `organization-service` | Build atualizado + `start` |
| Em edição | Serviços identificados pela tarefa | `dev`/watch |
| Dependências adicionais | Chamadas HTTP e processos necessários ao fluxo | Build atualizado + `start` |

A lista base é o padrão solicitado pelo time, não a prova de que qualquer tela
funciona apenas com ela. Inspecione chamadas do cenário escolhido; por exemplo,
um fluxo de tarefas pode exigir projetos. Dependências HTTP não são descobertas
somente pelo grafo de pacotes pnpm/Turbo. Inclua a cadeia necessária e explique
cada serviço adicional.

Se um serviço da base estiver em edição, execute **uma instância em watch** em
vez de adicionar uma segunda instância compilada. Bibliotecas compartilhadas
podem precisar de build/watch próprio; elas não são serviços HTTP.

Antes de executar, apresente uma única proposta curta com:

- UI + os cinco serviços base;
- serviços adicionais, motivo e modo;
- processos a reutilizar e builds/preparação necessários;
- bloqueios detectados e URL local prevista, sem segredos.

Uma stack completa já ativa não substitui essa proposta. Mostre o conjunto
detectado nas alterações e o conjunto atualmente ativo separadamente. Se houver
serviços extras, ofereça reaproveitar a stack existente ou executar somente o
conjunto sugerido; aguarde a decisão antes de parar ou substituir processos.
Reaproveitar todos com autorização permite testar, mas não comprova execução
seletiva. O relato de healthchecks não substitui a seleção nem sua confirmação.

Exemplo de conversa, não saída de uma execução real:

> UI e base incluídas. Sugiro task-service em watch por causa da tarefa e
> project-service compilado para testar sua dependência. Vou reaproveitar os
> processos compatíveis e compilar o que estiver desatualizado. Confirma esse
> conjunto ou quer incluir outra funcionalidade?

Espere a resposta. Uma confirmação já dada para esse mesmo conjunto na sessão
continua válida; mudança relevante de escopo pede confirmação do acréscimo.
Um pedido explícito que já autorize o conjunto e sua execução também vale como
confirmação. Preparar/watch das bibliotecas necessárias faz parte desse conjunto;
acrescentar serviços HTTP requer atualizar a proposta.
Se não houver contexto, sugira UI + base e pergunte qual funcionalidade será
usada. O usuário pode confirmar só a base. Explique dependências obrigatórias
quando ele remover um componente necessário.

## 3. Executar o conjunto aprovado

Leia [references/execucao-local.md](references/execucao-local.md) antes de executar.
Use os scripts reais do checkout e sessões/terminais identificáveis no ambiente
Codex. Compile os pacotes necessários, inicie base/dependências e depois UI e
serviços em edição. Reaproveite os processos verificados. Mantenha logs por
processo e registre como encerrá-los na mesma sessão.

`pnpm dev` da raiz usa o orquestrador seletivo e não executa reset destrutivo. Escolha
`pnpm dev -- --profile <nome>` ou `pnpm dev:full` conforme a proposta aprovada; use
`pnpm dev:recover -- --apply` somente para recuperação explícita. Não use
Compose/deploy da VPS para desenvolvimento.

Se um serviço da base mudar, atualize seu build ou passe a watch antes de testar.
Se `shared` ou código gerado mudar, atualize os artefatos consumidos e reinicie
somente os processos afetados sob gestão desta sessão. Não informe que a base
está atualizada só porque um processo antigo continua respondendo.
Para substituir um processo iniciado fora desta sessão, confirme sua origem e
inclua a substituição na proposta; execute se já autorizada, ou peça confirmação
apenas dessa substituição. Processos desconhecidos ficam intactos.

## 4. Verificar e entregar

- Verifique os healthchecks com semântica de sucesso dos serviços selecionados
  e o acesso à UI. O `/ready` do gateway pode só contar destinos configurados;
  ele não comprova que os serviços estão acessíveis.
- Teste uma operação do fluxo por meio do gateway, preferindo leitura. Login e
  smoke com dados dependem da configuração de desenvolvimento disponível;
  informe qualquer parte não verificada. Não fabrique resultados ou dados.
- Em caso de erro de build ou execução, identifique a etapa e o log relevante.
  Faça diagnóstico limitado; não transforme a inicialização em migração de
  compilador, alteração de infraestrutura ou deploy.
- Entregue URL, serviços/modes ativos, reaproveitados, falhas, validações feitas
  e como encerrar os processos iniciados nesta sessão. Não inicie serviços fora
  do conjunto; se extras preexistentes foram preservados, declare quais são.
  Funcionalidades de serviços desligados podem não funcionar.

O resultado esperado é o conjunto aprovado utilizável, ou um relato preciso do
bloqueio. Um terminal aberto, build aprovado ou HTTP 200 isolado não comprova
que o fluxo de debug está pronto.
