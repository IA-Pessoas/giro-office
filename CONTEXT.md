# Workspace

Plataforma multi-organização: cada organização tem seus usuários e níveis por módulo; a plataforma é operada por super admins que atravessam organizações.

## Identidades

**Usuário de organização**:
Pessoa que pertence a uma organização e acessa os módulos dela conforme seus níveis de permissão.
_Avoid_: conta, cliente

**Super admin**:
Pessoa que opera a plataforma, fora de qualquer organização, e administra organizações e seus usuários.
_Avoid_: usuário de plataforma, admin global, root

**Owner**:
Usuário de organização com poder total sobre a própria organização, acima dos níveis por módulo (ver `docs/adr/0002-owner-ignora-niveis-por-modulo.md`).
_Avoid_: proprietário (só na UI), dono

**Visualizador**:
Nível 1 de um módulo: lê, mas não escreve. Nível 2 (Usuário) escreve; nível 3 (Administrador) administra.
_Avoid_: viewer (na UI)

## Personificação

**Personificação**:
Um super admin agindo dentro de uma organização como se fosse um usuário específico dela, com os mesmos poderes desse usuário.
_Avoid_: impersonate (na UI), login como, sudo, acessar como

**Operador**:
O super admin que está personificando.
_Avoid_: impersonator (na UI), admin

**Alvo**:
O usuário de organização ativo que está sendo personificado.
_Avoid_: personificado, vítima, usuário impersonado

**Sessão de personificação**:
O período entre o operador iniciar a personificação e sair dela ou ela expirar.
_Avoid_: sessão impersonada

**Permissão de personificar**:
Atributo de um super admin que o autoriza a iniciar personificações; só quem já a tem pode concedê-la ou revogá-la.
_Avoid_: flag de impersonate

## Solicitações de RH

**Responsável**:
Usuário do RH que atende a solicitação. Nunca é o próprio solicitante, e uma solicitação só é resolvida com um responsável existente.
_Avoid_: atendente, dono

**Status da solicitação**:
Novo → Em andamento → Resolvido → Fechado. Enviar a solução move para Resolvido. O solicitante aceita (Fechado) ou recusa, e a recusa volta para Em andamento.
_Avoid_: concluído (como status)

**Pendente**:
Solicitação em Novo ou Em andamento, isto é, aguardando o RH. O dashboard e o badge da aba contam pelo total do backend, não pela página carregada.
_Avoid_: aberta, em aberto

**Resolvido**:
O responsável enviou uma solução e ela aguarda a resposta do solicitante. Ainda pode voltar para Em andamento.
_Avoid_: finalizado

**Fechado**:
O solicitante aceitou a solução. É o único status terminal: não aceita novas mensagens.
_Avoid_: encerrado, arquivado

## Provas discursivas de RH

**Prova discursiva**:
Avaliação criada pelo RH com avaliador, participantes, janela informativa e questões com valor e gabarito. Estados da prova: Nova → Aberta → Fechada, ou Cancelada.

**Abertura da prova**:
Transição de Nova para Aberta. Cria uma resposta vazia por questão e participante, sem duplicar respostas existentes.

**Janela da prova**:
Datas previstas para realização. São informativas e não bloqueiam automaticamente respostas ou entregas.

## Projeto de Vida

**Projeto de Vida**:
Plano anual de um colaborador. Registra histórias de vida e da empresa e acompanha objetivos; cada colaborador pode ter um por ano.
_Avoid_: projeto pessoal (sem ano), avaliação de desempenho

**Objetivo do Projeto de Vida**:
Meta com previsão, data de conclusão, estado e observações do RH e do colaborador. Estados: A realizar, Realizado e Descontinuado.
_Avoid_: tarefa (quando não houver responsável e participação do catálogo de tarefas)

**Progresso do Projeto de Vida**:
Objetivos Realizados divididos pelo total de objetivos; sem objetivos, o progresso é zero.
_Avoid_: média de progresso
