# Issue #755 — continuação da revisão de senhas de certificados

Base `feature/milestone-7`: `edfc9a2c6602b1600bb0209880e147bd1f57d6ce`.
Branch `codex/issue-755`. O PR [#796](https://github.com/IA-Pessoas/giro-office/pull/796)
foi integrado anteriormente e faz parte de `develop`; a issue permanece aberta.

## Falha confirmada e correção

A leitura autorizada tratava um envelope JSON truncado como senha em texto,
devolvia esse conteúdo e chamava `updateMany` para criptografá-lo novamente.
Foi reproduzido em PJ e PF com persistência em memória e chave fictícia.
A classificação agora encaminha valores com prefixo de objeto, array ou string
JSON para a validação criptográfica, que rejeita dados incompletos antes de qualquer
retorno ou escrita. O comportamento para os demais formatos foi preservado.

Escopo: os dois services de certificado e seus testes. Os chamadores públicos são
as rotas de detalhe PJ/PF; permissão, organização, payloads, OpenAPI e frontend
permanecem nos contratos existentes. Sem nova dependência ou migration.
Graphify sem grafo local; foram lidos os services, rotas, crypto, testes e regras.

## Critérios e evidências

| Critério | Evidência | Estado |
| --- | --- | --- |
| Algoritmo, formato e configuração documentados | `certificatePasswordCrypto.ts` e README: AES-256-GCM, envelope versionado, chave Base64 de 32 bytes | Código documentado; correspondência com chave histórica pendente |
| Leitura PJ/PF somente com permissão >= 2 | Testes de services e rotas para níveis 1, 2 e 3 | Aprovado localmente |
| Nível 1 sem senha | Testes verificam ausência de senha e de descriptografia | Aprovado localmente |
| Dados inválidos sem retorno bruto nem escrita | 6 novos casos de JSON truncado em PJ/PF; assertion de `updateMany` não chamado | Aprovado localmente |
| Criação/edição criptografadas | Testes existentes de escrita e remoção do campo nas respostas | Aprovado localmente |
| Dados legados e backfill | Auditoria em transação READ ONLY: 781 envelopes, nenhum texto simples; chave atual não autentica nenhum deles | Bloqueado pela recuperação da chave histórica |

## Validação local

- TDD PJ: 3 falhas de regressão antes; 33 testes aprovados depois.
- TDD PF: 3 falhas de regressão antes; suíte completa aprovada depois.
- `pnpm --filter @workspace/certificate-service test`: 15 arquivos, 178 testes aprovados.
- `pnpm --filter @workspace/certificate-service exec tsc --noEmit`: aprovado.
- `pnpm --filter @workspace/certificate-service exec tsc`: build aprovado.
- `pnpm --filter @workspace/certificate-service check`: 49 arquivos, aprovado.
- Biome nos quatro arquivos alterados e `git diff --check`: aprovados.
- Preparação: instalação congelada com scripts desabilitados, build do shared e
  `prisma generate --config ../../infra/prisma.config.ts --generator certificateServiceClient`.
  A geração é local; não executa migration.

`code-simplifier-v2` e `code-reviewer` aplicados ao diff: alteração pequena nos
classificadores existentes, sem nova abstração ou mudança de contrato. Nenhum
achado Critical/Important remanescente nessa correção. A revisão final independente
do milestone continua necessária.

## Auditoria operacional somente por leitura (2026-09-16)

[Contagens verificáveis](./password-compatibility.json): 439 PJ e 342 PF, todos com
envelope compatível em estrutura e versão; todos falham na autenticação AES-GCM
com a chave atualmente configurada. Essa chave tem formato válido, o que não
comprova correspondência com os dados. Nenhuma senha, chave ou identificador de
registro foi registrado no artefato. A transação confirmou `transaction_read_only=on`
e terminou com ROLLBACK. Zero registros alterados; não houve chamada de detalhe
com migração automática, backfill, deploy ou reinício de serviço.

O container observado usa a imagem `sha256:a487eef17a2626cdd289359a8c0ee4e7cf8340191390f94de81be6732d6fa17c`,
estava saudável, com zero reinícios e sem OOM. Essa observação não comprova o fluxo
funcional de leitura das senhas. A chave histórica correta deve ser recuperada em
local seguro e validada antes de declarar o critério legado atendido. Gerar outra
chave não recupera os envelopes existentes.

A issue não deve ser fechada com base apenas nesta correção. CI remoto e merge
serão registrados no PR; produção permanece sem alteração.
