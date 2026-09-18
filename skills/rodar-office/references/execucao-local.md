# Execução local com os comandos existentes

Esta primeira versão delega a execução ao Codex e aos scripts do checkout.
Não há daemon ou comando `dev:ensure` fornecido pela skill. Use o shell e os
terminais disponíveis no sistema do usuário (macOS ou Windows); exemplos abaixo
são comandos individuais executados na raiz, sem sintaxe específica de Bash.

## Preparação

1. Confira a versão declarada de pnpm e a exigência de Node nos manifests. Se
   dependências faltarem, use a instalação frozen-lockfile prevista pelo repo,
   após a confirmação do conjunto. Preserve políticas de scripts de instalação;
   não libere builds de dependências globalmente para contornar um erro.
2. Confira as variáveis locais exigidas por cada pacote e o destino da API da UI.
   Ler nomes e presença não exige revelar valores secretos. Peça somente a
   configuração ausente que impeça o início; não copie `.env.vps.*` como fallback.
3. Descubra os nomes de pacote reais em `package.json` e leia o registry em
   `scripts/service-registry.mjs`, se existir, para portas/caminhos. Ele é apoio
   de navegação; verifique dependências HTTP nas configurações e chamadas reais.
4. Para serviços com Prisma, preserve `prebuild`/`predev` e o gerador compartilhado
   do repo. Não execute migrations, reset ou seed como parte da inicialização.
   Se o lock do gerador parecer travado, verifique o processo dono antes de mexer
   no lock; não remova um lock ativo.

## Builds direcionados

Exemplo para os cinco pacotes da base, se esses nomes/scripts existirem:

```text
pnpm exec turbo run build --filter=@workspace/gateway --filter=@workspace/client-service --filter=@workspace/audit-service --filter=@workspace/user-service --filter=@workspace/organization-service
```

Inclua os filtros das dependências adicionais que rodarão compiladas. O grafo de
build cuida dos pacotes declarados como dependências; mantenha as etapas de
Prisma necessárias. Para um serviço somente em watch, garanta antes o build das
bibliotecas que ele importa, sem exigir seu build de produção desnecessariamente.
Se a UI consumir `@workspace/api` ou outros pacotes em `dist`, prepare-os também.

Use o resultado do build para validar a atualização dos artefatos. Preserve
caches e deixe Turbo decidir reaproveitamento conforme a configuração existente;
não adicione limpezas globais. Na primeira execução o build pode ser demorado.
A skill não modifica as estratégias de compilação do projeto.

## Processos

Abra uma sessão/terminal persistente identificado por serviço. Exemplos:

```text
pnpm --filter @workspace/user-service start
pnpm --filter @workspace/task-service dev
pnpm --filter @workspace/app dev
```

Repita `start` para base/dependências aprovadas e `dev` para os serviços em edição.
Se um serviço pertence aos dois grupos, execute apenas `dev`. Confira o script
`start` e a existência do entrypoint emitido antes de iniciar. Se o build emitir
um caminho diferente do manifest, reporte a divergência; não anuncie sucesso ou
reescreva scripts do projeto silenciosamente.
Nesta primeira versão, corrigir manifests/tsconfig fica fora da inicialização:
informe a correção necessária. Um comando alternativo já previsto e verificado
no checkout pode ser usado, explicando qual será executado.

Use a gestão de processos/terminais disponível no cliente; não conte com um
comando bloqueante de curta duração para manter todos os processos vivos. Se o
cliente não suportar sessões persistentes, deixe comandos precisos para terminais
locais e explique a limitação. Registre IDs/PIDs/terminais e logs sem segredos.
Ao encerrar, pare somente processos cuja propriedade foi confirmada.
Processos preexistentes também precisam de autorização para substituição ou
encerramento, que pode constar da proposta já aprovada.

Porta ocupada por processo desconhecido: identifique o dono e sua origem; se não
for possível, peça decisão antes de parar ou substituir. Uma nova porta exige
alinhar URLs de consumidores, incluindo UI/gateway. Não use kill por número de
porta nem `dev:reset` como solução genérica.

## Resolução e dependências durante o debug

`shared` exporta alguns módulos via `dist`; declarar condições `development` em
parte do pacote não garante que todos os serviços consumam fontes diretamente.
Quando houver alterações compartilhadas, utilize o watch real desse pacote e
verifique atualização/reinício dos consumidores. Não invente um novo modo de
resolução durante esta skill.

O gateway conhece rotas de serviços desligados. Isso não obriga iniciá-los todos.
O Compose de VPS, porém, declara muitos `depends_on`; não o reutilize como
orquestração local seletiva. Uma resposta 502 de uma rota fora do conjunto pode
ser consequência do destino desligado; não afirme que existe mensagem amigável
ou ativação automática se o código não implementa isso.

Base compilada significa execução local de JavaScript com env de desenvolvimento,
não uso de credenciais ou modo de produção. Banco/auth necessários continuam
sendo dependências externas já configuradas para desenvolvimento.
