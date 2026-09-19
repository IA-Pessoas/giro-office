# Selecionar serviços a partir das alterações

Faça esta análise somente de leitura antes de preparar ou iniciar processos.

## Descobrir as mudanças

Na raiz do checkout, confira separadamente:

```text
git status --short
git diff --name-status
git diff --cached --name-status
git ls-files --others --exclude-standard
```

Inclua arquivos staged, unstaged e novos. Em renomeações, considere o caminho
antigo e o novo; exclusões também podem afetar o serviço de origem. Trate nomes
com espaços corretamente: prefira as variantes `-z` quando processar a saída
programaticamente. Não use um split ingênuo por espaços.

Se a tarefa aponta uma branch, PR ou commit já gravado, examine também o diff
desse intervalo, com a base explicitada. Um checkout limpo pode conter a mudança
a testar em commits. Não escolha `main`, `HEAD~1` ou o último deploy como base
sem evidência de que representam a tarefa. Sem base/contexto confiáveis,
pergunte qual funcionalidade testar em vez de concluir que nada mudou.

## Mapear por propriedade e depois por dependência

| Caminho alterado | Como classificar |
| --- | --- |
| `services/<diretório>/...` | Leia `services/<diretório>/package.json`: seu `name` identifica o pacote dono. Verifique o serviço no registry. |
| `app/...` | UI. Confira cliente de API/rota da tela alterada para sugerir backend; CSS ou layout sem chamadas não implica um serviço extra. |
| `shared/...`, `packages/...` | Biblioteca. Leia imports/consumidores relevantes para apontar serviços possivelmente afetados. |
| `infra/prisma/...`, geração de clientes | Impacto compartilhado; procure modelos/consumidores ligados à tarefa e pergunte o fluxo se a seleção continuar ampla. |
| Lockfile, configuração global, Docker, scripts | Pode afetar build/execução de vários pacotes; não há serviço único determinado só pelo caminho. |
| Documentação, artefatos gerados, arquivos sem relação com a tarefa | Informe separadamente; não acrescente serviços só por esses arquivos. |

Leia arquivos reais antes de inferir uma chamada HTTP. Por exemplo, uma mudança
em `services/task-service/src/...` pertence a task-service; project-service só
entra como dependência do teste se as chamadas do fluxo o justificarem. Diferencie
“serviço modificado” de “serviço necessário para testar”.

Se houver alterações de múltiplas tarefas misturadas, apresente os candidatos e
pergunte qual conjunto será testado. Não escolha silenciosamente nem suba tudo.

## Resultado esperado antes da execução

Mostre uma tabela pequena, por exemplo:

| Evidência | Serviço | Papel sugerido |
| --- | --- | --- |
| `services/task-service/src/...` | task-service | Modificado, em watch |
| Chamada do fluxo de tarefas para projetos, conferida no código | project-service | Dependência, compilado |

Acrescente UI + base uma única vez e peça confirmação do conjunto. Use caminhos
que realmente encontrou; as linhas acima são exemplos. Com dados insuficientes,
a saída correta é uma pergunta com sugestões, não uma seleção inventada.

Uma stack já rodando serve como inventário de processos, nunca como evidência
de quais serviços as alterações exigem. Após a confirmação, volte à etapa de
execução da skill; não termine apenas entregando a lista se iniciar o ambiente
estiver autorizado e for possível nessa máquina.
