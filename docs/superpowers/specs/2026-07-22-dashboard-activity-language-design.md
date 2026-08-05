# Linguagem amigável no feed de atividades do dashboard

**Data:** 2026-07-22
**Status:** aprovado para planejamento

## Contexto

O dashboard inicial monta o feed de atividades a partir dos registros de
`public.audit_requests`. Quando `action` e `referring` não estão preenchidos, o gateway
transforma o método HTTP em um verbo genérico e exibe o `path` como item. Além de expor detalhes
técnicos, o `path` pode ser salvo sem o prefixo de domínio durante o proxy. Isso produz mensagens
como `Davi acessou /list`, que não informam ao usuário qual atividade ocorreu.

O feed deve usar linguagem de negócio, por exemplo:

- `Davi consultou a lista de tarefas`;
- `João cadastrou um novo usuário`;
- `Maria aprovou uma solicitação de TI`.

## Objetivos

- Preservar a rota pública completa no registro de auditoria.
- Traduzir requisições relevantes em `ação + item` compreensíveis ao usuário.
- Manter todas as requisições na auditoria técnica, mesmo quando não devem aparecer no dashboard.
- Exibir no feed apenas atividades relevantes e concluídas com sucesso.
- Evitar a exposição de IDs, parâmetros de busca e dados sensíveis.
- Centralizar o vocabulário no gateway e facilitar a inclusão de novas rotas.
- Manter temporariamente no feed os registros anteriores à mudança, até a renovação planejada do
  banco de dados.

## Fora de escopo

- Migrar ou reescrever registros históricos.
- Alterar o layout visual do dashboard.
- Exibir valores enviados no corpo, query string ou parâmetros identificadores.
- Substituir a auditoria técnica por um log exclusivamente voltado ao feed.
- Produzir descrições com nomes de entidades obtidos por consultas adicionais ao banco.

## Decisão de arquitetura

Será criado no gateway um catálogo semântico central e puro. O catálogo receberá o método HTTP e
o caminho público completo e retornará uma descrição quando a atividade for relevante:

```ts
interface ActivityDescription {
  action: string;
  item: string;
}

function describeActivity(method: string, path: string): ActivityDescription | null;
```

O retorno `null` significa que a requisição deve permanecer disponível na auditoria, mas não deve
ser exibida como atividade no dashboard.

Esta abordagem foi escolhida porque mantém o vocabulário em um único lugar, não duplica regras no
frontend e não exige alterar todos os serviços. Os campos `action` e `referring` já existentes no
contrato de auditoria serão reutilizados.

## Fluxo de dados

1. No início da requisição, antes da execução de routers montados e proxies, o middleware captura o
   `pathname` de `request.originalUrl` sem a query string.
2. Ao concluir a resposta, o middleware classifica o resultado como sucesso, erro ou aborto.
3. O catálogo recebe o método e o caminho capturado.
4. Quando o catálogo retorna uma descrição, o registro recebe `action`, `referring` e a marca
   `metadata.activityVisible = true`.
5. Quando não há descrição, o registro recebe `metadata.activityVisible = false`, mas continua
   sendo gravado integralmente para auditoria.
6. A consulta do dashboard seleciona somente eventos novos marcados como visíveis e bem-sucedidos.
7. Durante a transição, registros antigos sem a propriedade `activityVisible` continuam elegíveis
   para o comportamento atual. Essa compatibilidade pode desaparecer naturalmente após a renovação
   planejada do banco.
8. O frontend continua renderizando `usuário + ação + item`, sem conhecer métodos ou rotas HTTP.

## Catálogo semântico

O catálogo combinará metadados de recursos com regras de ação. Cada recurso terá rótulos e artigos
definidos explicitamente, evitando pluralização ou gênero gramatical inferidos de forma insegura.

Exemplos de recursos iniciais:

- usuários;
- organizações;
- departamentos;
- clientes;
- tarefas e modelos de tarefa;
- projetos e planos de projeto;
- módulos de RH;
- processos de regularização;
- recursos fiscais e contábeis;
- inventário, solicitações e demais recursos de TI;
- certificados;
- recursos do módulo pessoal.

As regras comuns serão:

| Operação | Exemplo de resultado |
| --- | --- |
| Listagem (`GET .../list`) | `consultou a lista de tarefas` |
| Detalhe (`GET .../:id`) | `consultou uma tarefa` |
| Criação (`POST`) | `cadastrou uma nova tarefa` |
| Atualização (`PUT` ou `PATCH`) | `atualizou uma tarefa` |
| Exclusão (`DELETE`) | `excluiu uma tarefa` |

Ações que não representam CRUD terão regras explícitas. Entre elas estão aprovar, concluir,
cancelar, atribuir responsável, alterar status, baixar e exportar. Regras explícitas terão
precedência sobre regras genéricas.

Segmentos que representem UUIDs, IDs numéricos ou outros identificadores serão normalizados para
correspondência, mas nunca incorporados à frase. Query strings e corpos de requisição não serão
usados na descrição.

Rotas técnicas, como sessão, autorização, health check, métricas, OpenAPI e carregamentos
auxiliares, retornarão `null`. Uma rota de negócio nova que ainda não possa ser descrita com
segurança também retornará `null`; ela deverá ser incluída explicitamente no catálogo antes de
aparecer no feed.

## Compatibilidade e persistência

Não haverá migração de banco. A implementação reutilizará:

- `audit_requests.action` para o verbo amigável;
- `audit_requests.referring` para o complemento da frase;
- `audit_requests.metadata_json` para `activityVisible`.

`referring_id` permanece disponível para os usos atuais de auditoria, mas não será exibido no feed.
A API do dashboard manterá o contrato atual de `user`, `action`, `item`, `time`, `avatar` e `tone`.

## Tratamento de falhas

- O catálogo será uma função determinística, sem acesso ao banco ou à rede.
- Método inválido, caminho malformado ou rota desconhecida resultarão em `null`.
- Uma falha de tradução não poderá impedir a resposta HTTP nem a gravação da auditoria.
- Respostas com erro ou requisições abortadas continuarão na auditoria e não serão apresentadas no
  feed como ações concluídas.
- A ausência de nome do usuário manterá o fallback atual `Usuário`.

## Validação

### Testes unitários do catálogo

Testes tabelados cobrirão:

- listagem, detalhe, criação, atualização e exclusão;
- recursos masculinos e femininos, no singular e no plural;
- ações especiais e sua precedência sobre regras genéricas;
- caminhos com identificadores;
- remoção de query string;
- rotas técnicas e desconhecidas;
- métodos e caminhos malformados.

### Testes de integração do gateway

- `GET /task/list` deve ser gravado com o caminho completo, `action = consultou`,
  `referring = a lista de tarefas` e `activityVisible = true`.
- Uma rota técnica deve ser auditada com `activityVisible = false`.
- Uma requisição relevante com resposta de erro não deve ser elegível ao feed.
- A captura deve preservar o caminho completo mesmo dentro de um proxy montado por prefixo.

### Testes do serviço do dashboard

- Eventos visíveis e bem-sucedidos devem ser apresentados com os campos amigáveis.
- Eventos novos marcados como não visíveis, com erro ou abortados devem ser excluídos.
- Registros antigos sem `activityVisible` devem manter o fallback atual durante a transição.
- A ordenação por data e o limite atual de cinco itens devem ser preservados.

### Cobertura de rotas

Uma verificação escopada comparará as rotas públicas relevantes com o catálogo. A inclusão de uma
rota nova deverá resultar em uma decisão explícita: descrição amigável ou classificação técnica.
Isso evita que endpoints novos apareçam acidentalmente como paths ou desapareçam sem intenção.

## Critérios de aceite

- O dashboard não exibe paths técnicos para novas atividades classificadas.
- A frase final é compreensível sem conhecimento de APIs ou rotas.
- `/task/list` resulta em `consultou a lista de tarefas`.
- Uma criação de usuário resulta em `cadastrou um novo usuário`.
- Chamadas técnicas e operações malsucedidas não aparecem entre as novas atividades.
- Todas as requisições continuam disponíveis no registro técnico de auditoria.
- O frontend não contém mapa duplicado de rotas ou verbos.
- Nenhuma frase inclui ID, query string, token ou conteúdo de requisição.
