# Giro Office

Linguagem compartilhada dos domínios do Giro Office. Este glossário distingue os conceitos de
Projetos usados durante a criação assistida.

## Projetos

**Ata de reunião**:
Documento ou texto opcional que registra uma reunião e pode servir de fonte para propor tarefas de
um novo projeto. A ata não integra o projeto depois da confirmação.
_Evitar_: Anexo do projeto, documento do projeto

**Tarefa proposta**:
Item de trabalho inferido da ata ou incluído manualmente durante a criação de um projeto. Ainda não
é uma tarefa do projeto e pode ser corrigido ou removido antes da confirmação.
_Evitar_: Tarefa extraída, tarefa criada, rascunho de tarefa

**Tarefa manual**:
Tarefa proposta incluída diretamente pelo usuário. Não é substituída quando uma nova extração da
ata é realizada.
_Evitar_: Tarefa da IA

**Tarefa de projeto**:
Item de trabalho confirmado e vinculado ao projeto e ao cliente do projeto. Em novas tarefas, seu
Modelo de Tarefa pertence ao mesmo departamento.
_Evitar_: Tarefa proposta

**Tarefa principal**:
Tarefa proposta diretamente pela IA ou pelo usuário e que pode incluir Tarefas dependentes por
meio de seu Modelo de Tarefa.
_Evitar_: Tarefa dependente, tarefa direta

**Modelo de tarefa**:
Modelo organizacional que classifica uma tarefa de projeto e fornece seus padrões operacionais.
Toda tarefa de projeto deve estar vinculada a um modelo.
_Evitar_: Tipo de tarefa, template

**Responsável departamental**:
Usuário ativo do departamento responsável pela tarefa de projeto, reconhecido pela organização
como líder de RH ou administrador.
_Evitar_: Departamento responsável, responsável genérico

**Tarefa sem responsável**:
Tarefa de projeto criada para um departamento que ainda não possui um Responsável departamental
elegível. Continua visível e aguarda atribuição posterior; não pode ser escolhida voluntariamente
quando existe um responsável elegível.
_Evitar_: Tarefa inválida, tarefa não criada

**A Realizar**:
Estado inicial de uma Tarefa principal cujo trabalho ainda não começou, inclusive quando ela está
sem responsável. Corresponde ao estado TODO do fluxo de trabalho.
_Evitar_: Em andamento, pendente de criação

**Tarefa dependente**:
Tarefa de projeto incluída por uma regra do Modelo de Tarefa escolhido, mesmo quando não foi
proposta diretamente a partir da ata. Deve ser conhecida antes da confirmação do projeto e começa
em `Em Espera` somente quando o modelo determina espera; nos demais casos começa em `A Realizar`.
_Evitar_: Tarefa oculta, tarefa automática

**Tentativa de extração**:
Ação iniciada pelo usuário para transformar uma fonte válida em tarefas propostas, mesmo quando o
processamento interno divide a fonte em partes.
_Evitar_: Chamada individual ao provedor
