# Contábil: contrato canônico da Triagem

O primeiro recorte do módulo Contábil usa o `contabil-service` como fonte canônica para
controles mensais e Triagem. O gateway expõe `/contabil` e `/triagem`, encaminhados para
o mesmo serviço, com autenticação, organização e auditoria preservadas pela registry única.

## Identidade e estados

- O controle mensal é identificado por `organization_id`, `client_id` e `competence`.
- A criação anual exige `confirmed: true`, cria as doze competências de forma idempotente e
  registra o lote em auditoria.
- O fechamento recebido é independente do checklist documental. Ausência na leitura retorna
  `NOT_RECEIVED` sem persistir uma linha.
- Os únicos estados de fechamento são `NOT_RECEIVED`, `RECEIVED`, `UNDER_REVIEW`, `CLOSED`
  e `REOPENED`.
- Extratos usam `bank_id` como identidade por cliente e competência. Não armazenam dados de
  conta bancária neste recorte.

## Arquivamento e recuperação

Arquivar uma competência preserva os controles, pendências documentais, extratos e estado de
fechamento por meio de `archived_at`; a visão operacional ativa não os lista. A restauração
remove esse marcador dos mesmos rastreadores. A migração correspondente deve ser aplicada
antes de disponibilizar essas operações em qualquer ambiente compartilhado.

## Relatórios e limites

O catálogo interno de relatórios publica somente campos aprovados de controles, responsáveis
e relacionamento. Ele não publica anexos, notas, estados de Triagem, dados bancários nem
campos de outra organização. Cada extração recebe um grant HMAC de curta duração e aplica
`organization_id` no delegate Prisma antes de retornar linhas.

Não há neste primeiro recorte importação de anexos, conciliação financeira, automação de
fechamento ou acesso público às rotas internas de relatórios. Esses limites evitam que a
Triagem seja interpretada como um repositório documental ou bancário completo.
