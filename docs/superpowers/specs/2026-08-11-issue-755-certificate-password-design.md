# Issue #755 — Senha de certificados criptografada após migração

## Objetivo

Corrigir o fluxo de certificados PJ e PF para que valores de senha persistidos no formato legado
sejam descriptografados somente no detalhe autorizado, enquanto novas criações e atualizações
continuam armazenando apenas o envelope criptografado.

## Contexto confirmado

- A migração atual copia `row.senha` diretamente para `password`.
- A evidência da issue mostra o envelope JSON versionado com os campos `v`, `iv`, `tag` e `data`.
- O formato é AES-256-GCM com IV de 12 bytes, tag de autenticação em base64 e chave base64 de 32
  bytes.
- O mesmo formato já é usado pelo `pessoal-service` e a configuração da VPS mantém uma chave de
  senha versionada para esse contrato.
- O `certificate-service` atual retorna o valor de `password` sem uma etapa de descriptografia.

## Desenho aprovado

### Criptografia compartilhada

Extrair para `shared` o comportamento genérico do envelope textual já usado em
`pessoal-service`. O helper deve criptografar e descriptografar strings, validar chave base64 de
32 bytes, validar a versão do envelope e permitir detectar se um valor já está criptografado.
`pessoal-service` continuará usando sua API específica e o `certificate-service` usará uma API
específica para traduzir falhas em mensagens de domínio seguras.

### Configuração do certificado

Adicionar ao `certificate-service` uma chave e uma versão próprias para senhas:

- `CERTIFICATE_PASSWORD_ENCRYPTION_KEY`
- `CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION`

Os valores reais ficam apenas nos ambientes de execução. A documentação registra o algoritmo, o
formato e a exigência de chave base64 com 32 bytes; nenhum segredo será versionado.

### Leitura autorizada

`GET /certificate/pj/:id` e `GET /certificate/pf/:id` manterão a regra atual de permissão:

- `certificado >= 2`: descriptografar e retornar a senha normal;
- `certificado < 2`: remover completamente `password` da resposta;
- envelope inválido ou incompatível: retornar `422` com mensagem segura, sem incluir o valor bruto
  ou detalhes criptográficos na resposta.

Valores legados em texto puro serão recriptografados no primeiro detalhe autorizado e então
retornados como texto normal. Isso evita um backfill SQL obrigatório para o caso compatível.

### Escrita

Criação e atualização de certificados PJ/PF criptografarão `password` antes do Prisma. O retorno
dessas operações não incluirá `password`, evitando expor texto puro ou o envelope persistido.

### Testes e validação

Serão cobertos:

- round-trip do helper e rejeição de chave/payload inválidos;
- configuração do `certificate-service`;
- leitura autorizada e bloqueada para PJ e PF;
- recriptografia de valor legado em texto puro;
- erro `422` para envelope incompatível;
- persistência criptografada em criação e atualização;
- contratos HTTP das rotas;
- typecheck, lint, build e suíte do `certificate-service`.

Não haverá alteração de frontend ou necessidade de Playwright, pois o frontend já renderiza o
campo recebido pela API e a correção é exclusivamente de contrato/backend.

## Escopo fora da mudança

- Não alterar a autorização do gateway.
- Não criar backfill destrutivo ou migração SQL sem evidência de que a compatibilidade sob demanda
  não cobre os registros existentes.
- Não versionar chaves, dumps, screenshots ou valores de senha.
