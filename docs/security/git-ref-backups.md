# Backups de refs Git

Esta ferramenta cria snapshots de refs e objetos Git sem checkout. O manifesto local tem o status
`external-control-required`: ele registra integridade do bundle, mas não prova object lock, storage
write-once, retenção, conta separada ou aprovação de produção.

## Pré-requisitos externos

- Use uma GitHub App separada e somente leitura para capturar metadados opcionais.
- Armazene os snapshots em storage de outra conta, com object lock ou write-once habilitado.
- Mantenha uma atestação independente da retenção, classificação legal e período de retenção.
- Registre evidência trimestral de cada drill. Nenhuma dessas medidas é configurada por este
  repositório.

## Cadência e recuperação

- Execute snapshots de repositórios ativos a cada hora; capture metadata diariamente quando ela for
  necessária.
- O objetivo de recuperação é quatro horas (4 horas) ou menos; ajuste a cadência à RPO aprovada.
- Verifique o bundle e restaure somente em um mirror de quarentena novo e isolado.
- Alterações de refs de produção exigem aprovação explícita documentada fora desta ferramenta. O drill
  nunca faz push, checkout, reset, exclusão ou restauração de produção.

## Operação

Crie um destino novo para cada snapshot e execute o comando `snapshot`. Para metadados, informe
explicitamente `--github-repo owner/repo --include-metadata`. Sem essa flag, a ferramenta não chama
`gh`. Execute `verify` antes de qualquer drill e informe um diretório de quarentena ainda inexistente
para `drill`.

Falhas preservam evidências locais para investigação; não reutilize ou sobrescreva um destino já
existente. A aprovação explícita de produção, os controles de imutabilidade e a retenção continuam
responsabilidade operacional externa.
