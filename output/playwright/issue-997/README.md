# QA adversarial do wizard — #997

Head de código validado: `41655b3d7333913a7d9683fe2e9367cc7c520c35`.
Este registro posterior altera somente a evidência, preservando os hashes do código testado.

Base de implementação: `edfc9a2c6602b1600bb0209880e147bd1f57d6ce` (`develop`). Branch
`codex/issue-997`, integração `feature/milestone-15`. Os hashes dos arquivos testados estão em
[validation.json](validation.json); o PR registra o head final. Sem merge ou deploy nesta evidência.

| Critério | Evidência | Estado |
| --- | --- | --- |
| Três tentativas, bloqueio e continuidade manual | Browser: 1 sucesso, reextração com substituição, 422 com preservação; revisão manual permanece habilitada após a terceira tentativa; captura 06 | Aprovado localmente |
| Reextração preserva manual/último resultado | Asserções de campos, grupos e payloads no runner | Aprovado localmente |
| Troca de fonte confirma e preserva manual/contador | Cancelar/confirmar limpeza; arquivo e texto mutuamente exclusivos; contador segue 3 | Aprovado localmente |
| Voltar/cancelar/fechar/recarregar | Estado dos campos, propostas, contador e fonte; recarga retorna aos valores vazios | Aprovado localmente |
| Arquivos rejeitados sem tentativa | Tipo, vazio, 10 MB+1; DOCX corrompido e PDF digitalizado; 98 testes de rota verificam parser e ausência de chamada ao provedor | Aprovado localmente |
| Permissões 0/1/2/3/owner | Navegador sem confirmação em 0/1, criação em 2/3/owner; HTTP 403 em 0/1 e 201 em 2/3/owner | Aprovado localmente |
| Acessibilidade | Foco em Fechar, Tab para Nome, Shift+Tab de retorno; descrição das três etapas; aria-invalid/describedby; alertas dentro do diálogo e status de extração | Aprovado localmente |
| Smoke real opt-in com chave temporária | Runner preservado fora da suíte; execução exige stack descartável e configuração temporária ainda não fornecidas | Não executado; ambiente pendente |
| Privacidade de QA | Sem vídeo/trace; máscaras na Ata; modo sensível sem capturas/propostas; 3 regressões do comando impedem vazamento por falha ou captura | Aprovado localmente |
| Head/comandos/resultados/limites | Este documento, validation.json e corpo do PR | Evidência local; CI/aceitação integral pendentes |

## Correções encontradas pelo QA

- HTTP400 de DOCX corrompido consumia uma tentativa no frontend, embora o backend rejeitasse o
  arquivo antes do provedor. A tentativa agora é devolvida. Falhas de extração reais continuam
  consumindo tentativa e preservam as propostas anteriores.
- Campos obrigatórios e falhas de extração/criação dependiam de notificações fora do diálogo.
  Os erros agora aparecem dentro dele; os campos referenciam a mensagem correspondente.
  O efeito de descarte também declara as funções estáveis de reset das mutações como dependências.
- O comando de evidência real gravava vídeo sem máscara e propagava erros do Playwright com
  conteúdo de campos/DOM. Vídeo e dumps foram removidos; falhas são sanitizadas. Capturas também
  ficam desativadas quando se usa uma Ata sensível.

## Validações

- `pnpm --filter @workspace/app test:projects`: 90 testes aprovados.
- `pnpm --filter @workspace/task-service exec vitest run src/test/projectWizard.routes.test.ts`:
  98 testes aprovados; autenticação, autorização, validação de fonte e contrato HTTP.
- `node --experimental-vm-modules --test app/scripts/wizard-evidence.test.mjs`: 3 testes aprovados.
- `pnpm --filter @workspace/app typecheck`: aprovado, incluindo tipos de useFetch.
- `pnpm --filter @workspace/app build`: aprovado em build de produção.
- Biome direto nos cinco arquivos JS/TS do app alterados: aprovado; o script de lint do app é noop,
  portanto a checagem usou as regras do Biome do repositório com a exclusão de app removida. A configuração exata
  está em `biome-frontend.json` neste diretório.
- Biome no teste da rota: aprovado.
- Browser no app compilado: aprovado; sem banco ou tráfego de provedor. Os mocks HTTP do browser
  são complementados pelos testes da rota real do task-service.
- Task-service completo: 395 testes aprovados e 6 testes opt-in de banco ignorados por falta
  de banco configurado; 41 arquivos aprovados e 1 ignorado. Typecheck do serviço aprovado.
- Suíte completa do app: 36 etapas aprovadas; Turbo 3/3 tarefas concluídas em 7m11s com
  `--env-mode=loose` e endpoints dos runners apontando para o build isolado. A tentativa inicial
  em modo strict descartou essas variáveis e falhou por timeout do servidor de desenvolvimento.
- Hook normal de `git push -u origin codex/issue-997`: 10/10 tarefas aprovadas em 8m13s,
  incluindo repetição completa do app e task-service no head acima. Nenhum hook foi contornado.
- Check completo do task-service: 109 arquivos aprovados. Foi necessário ajustar somente a
  quebra de linha e vírgula final do teste preexistente `internalReportingLimit.schemas.test.ts`;
  seu teste também passou, sem alterar valores ou condições.

O ciclo vermelho/verde reproduziu o contador incorreto (esperado 0, observado 1), a falta de
associação do erro no campo Nome, o alerta de arquivo vazio ausente do diálogo e o vazamento
simulado em erros do comando real. A prova de ausência de texto no PDF usa fixture digitalizada;
ela não depende de um provedor de IA.

## Reproduzir browser e capturas

Depois de compilar este checkout, sirva o standalone preservando os symlinks do pnpm, os arquivos
estáticos e public. Use uma cópia isolada do build se outra validação recompilar `.next`.

```bash
PROJECT_WIZARD_BROWSER_BASE_URL=http://127.0.0.1:33129 \
  PROJECT_WIZARD_BROWSER_CAPTURE=1 \
  PROJECT_WIZARD_BROWSER_ARTIFACT_DIR="$PWD/output/playwright/issue-997" \
  pnpm --filter @workspace/app test:project-wizard-browser
```

As seis capturas usam fixtures sintéticas, sem Ata literal, segredos, trace ou vídeo. São desktop,
PDF rejeitado, limite de tentativas, mobile claro/escuro e revisão manual após o limite. Os
artefatos intermediários de falha ficaram fora do repositório.

## Revisão e limites

Simplificação restrita ao diff: mesma validação alimenta a regra e os erros associados; sem nova
dependência de runtime ou mudança no contrato HTTP. Revisão local compara critérios com o código,
testes, chamadores e integração. A autorização do servidor continua na rota; esconder botões no
browser não é tratado como prova isolada de segurança.

O smoke real não foi executado nesta rodada. Não foram acessados dados reais nem consumidos
créditos OpenAI. Não se declara a aceitação integral da #997 enquanto a validação opcional real e
sua limitação ambiental não forem avaliadas. CI remoto, merge e deploy são estados separados.
