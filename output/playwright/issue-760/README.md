# #760 — Seleção de clientes no Contábil e Pessoal

Código validado: `701b614281b7b455ca63a05b835177136d3e7611`, baseado em
`edfc9a2c6602b1600bb0209880e147bd1f57d6ce`. Branch `codex/issue-760`, integração
`feature/milestone-7`. [validation.json](validation.json) registra hashes, contagens e limites.

A correção inicial dos filtros já estava em develop pelo PR #879. Restava uma colisão de cache:
a consulta do Parcelamento usa `ref=integracao`, mas os seletores de Contábil e Pessoal não usam
esse filtro. As duas consultas compartilhavam a chave e uma resposta vazia permanecia fresca
por60s. A chave agora usa o `ref` efetivo produzido pelo mesmo helper dos parâmetros HTTP.

| Critério | Evidência | Status |
| --- | --- | --- |
| Listar clientes nos dois departamentos | Navegação SPA a partir do Parcelamento com cache vazio; nova requisição sem filtro legado e duas opções exibidas | Aprovado localmente |
| Selecionar cliente | Clique fecha modal e atualiza botão de seleção nos dois módulos | Aprovado localmente |
| Busca por nome, razão social, CPF/CNPJ | Quatro termos no browser; filtros de busca do serviço revisados/testados | Aprovado localmente |
| Respeitar permissões e organização | Browser0/1/2/3/owner; rota HTTP com autenticação real e ClientService, incluindo outra organização recusada antes da consulta | Aprovado localmente |
| Erro e ausência de resultado | Estado vazio distinto do erro503, seguido de recuperação da consulta | Aprovado localmente |
| Evidência visual | Quatro capturas desktop/mobile com dados sintéticos; sem overflow horizontal | Registrada |

## Comandos e resultados

- `CLIENT_PICKER_BROWSER_BASE_URL=http://127.0.0.1:33130 pnpm --filter @workspace/app test:clients`:
  39 verificações existentes e10 cenários de browser aprovados. O smoke passou a integrar esse comando.
- `pnpm --filter @workspace/app test:contabil`, `test:pessoal` e `test:parcelamento`: aprovados.
- `pnpm --filter @workspace/client-service test`:90 aprovados,2 testes opt-in de banco ignorados.
- `pnpm --filter @workspace/gateway exec vitest run src/test/modulePermissionRegression.test.ts`:
  54 testes aprovados; nenhuma política do gateway foi alterada.
- `pnpm --filter @workspace/app typecheck`: aprovado, incluindo tipos de useFetch.
- `pnpm --filter @workspace/client-service exec tsc --noEmit`: aprovado após geração Prisma pelo script do pacote.
- `pnpm --filter @workspace/app build`: aprovado no head de código acima.
- `pnpm --filter @workspace/client-service check`:59 arquivos aprovados.
- Biome direto nos3 arquivos JS/TS do app alterados: aprovado com `biome-frontend.json` deste diretório.

O check do pacote exigiu apenas formatação em dois arquivos de reporting e duas anotações de
parâmetros em um teste existente; seus4 testes passaram. Comparação com a saída do Biome confirma
que essas mudanças de formatação não alteram comportamento. Não houve nova dependência.
A instalação usou lockfile congelado, cache offline e scripts de dependências desativados.

O ciclo vermelho/verde comprovou o modal vazio no Contábil antes da correção. O build final
compilado foi copiado preservando symlinks do pnpm e servido isoladamente, sem banco real.

## Capturas

- [Contábil desktop](contabil-clientes-viewer.png)
- [Contábil mobile](contabil-clientes-mobile.png)
- [Pessoal desktop](departamento-pessoal-clientes-viewer.png)
- [Pessoal mobile](departamento-pessoal-clientes-mobile.png)

Para repetir capturas, adicione `CLIENT_PICKER_BROWSER_ARTIFACT_DIR` apontando para este diretório.
Sem URL configurada, o runner inicia Next local e aquece as três rotas antes dos cenários.

## Revisão e limites

Simplificação e revisão local restritas ao diff, contra issue e integração: sem achados
Critical/Important. A UI mantém o desenho existente. Os mocks de HTTP do browser não são usados
como prova isolada de autorização: os testes da rota exercitam autenticação e serviço reais,
com Prisma injetado, verificando o filtro de organização e rejeições antes da consulta.

Hook completo de push e CI remoto serão registrados no PR. A base possui seis workflows
integralmente comentados que falham na validação do GitHub antes de executar jobs. Checks de
política verdes não significam CI integralmente aprovado. Nenhum merge ou deploy foi realizado.
