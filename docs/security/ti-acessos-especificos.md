# Acessos específicos de TI: legado → Office

Matriz da #1938 (épico #1926, spec #1923 §5). Lista cada controle da tela de configurações de
TI do Workspace legado que não é permissão por módulo, onde ele era concedido e conferido, e o
que o Office faz hoje. Fonte: `workspace/` legado, lido sem executar; Office em `epic/1926`
(2026-10-14).

No legado esses controles são linhas de `tb_admin.permissoes` (`modulo`, `referencia`,
`nivel`), concedidas na tela **Acessos Admin** (`tecnologia/pages/configuracoes/resp-alteracoes.php`)
por `ajax/permissoes.php`. Esse endpoint grava o que receber por POST sem conferir a permissão
de quem chama (só inclui `config.php`, que não está no código legado disponível); a proteção
era a página não aparecer no menu.

| Controle legado | Concedido em | Conferido em | Office atual | Autorização no serviço |
| --- | --- | --- | --- | --- |
| **Conclusão de tarefas** — `integracao` / `0` | Acessos Admin, coluna "Conclusão de tarefas" | `classes/Tarefa.php:57` e `integracao/pages/tarefas/editar-tarefa.php:36`: sem o acesso, concluir vira solicitação (`tb_integracao.tarefas_concluir`) | `permissions.specific.task_completion`, migrado pela regra `permission-specific-task-completion-merge` (`docs/migration/v4/scripts/rules/admin-business.mjs`). O serviço de tarefas (`services/task-service/src/services/taskLifecycleService.ts`, também usado pelo Worker) só conclui direto com o acesso e nível de usuário ou dono; senão abre solicitação de conclusão | Conferência: serviço de tarefas. **Concessão:** não havia rota nem tela; agora `GET /ti/specific-accesses/list` e `PATCH /ti/specific-accesses/{userId}` no TI Service (Node e Worker), só TI nível 3, com registro em `logs` |
| **Alteração de regime** — `workspace` / `0` | Acessos Admin, coluna "Alteração de Regime" | `classes/Painel.php:1189` (`btnAltRegime`): com o acesso, o atalho abre o painel do fluxo; sem ele, só as tarefas do próprio usuário | Não há fluxo de alteração de regime: `tb_workspace.alteracao_regimes*` estão `pending / NO_CURRENT_CONTRACT` no inventário da migração e a linha dinâmica fica em quarentena (`DYNAMIC_PERMISSION_NO_CURRENT_CONTRACT`) | Nada a conferir hoje. Quando o fluxo existir, a regra entra no serviço dele; não foi criada configuração para um acesso sem operação |
| **Updates do sistema** — tela "Gerenciar Updates" | Página restrita (`verificaPermissaoPagina(2)`) | `tecnologia/pages/sistema/gerenciar-updates.php` grava `tb_admin.updates` (título, versão, data, imagem, novidades, atualizações e remoções) e marca `tb_cbc.preferencias.updates` para avisar os usuários; `updates.php` lista | Não há mural de novidades no Office; `tb_admin.updates` e `tb_cbc.preferencias` estão `pending / NO_CURRENT_CONTRACT` | Nada a conferir hoje. Publicar novidades é funcionalidade nova, fora deste recorte |
| *Responsável por arquivos fiscais* — `fiscal` / `0` | Configurações do Fiscal (`fiscal/pages/configuracoes/resp-arquivos.php`), não da TI | `fiscal/pages/impostos/listar.php:141` | Fica em quarentena na migração, como as demais combinações sem contrato | Fora do escopo de TI; listado para completar o inventário de `tb_admin.permissoes` |

## Decisões

- **Quem concede a conclusão de tarefas:** TI nível 3. O legado é inconsistente: a página
  Acessos Admin pede `verificaPermissaoPagina(1)`, o card em `configs.php` só aparece com
  `verificaPermissaoMenu(2)` e o endpoint de gravação não confere nada. Ficou a regra mais
  restrita do módulo, aplicada no serviço. É uma interpretação da #1923 §5: a conclusão de
  tarefas não é permissão por módulo (essas seguem na Administração, e as gerais só com o dono),
  mas concede um poder de aprovação. **Pendente de confirmação do responsável pelo produto.**
- **Ninguém altera o próprio acesso:** a TI nível 3 não pode se conceder a aprovação de
  conclusões; outra pessoa da TI precisa fazer isso. O legado não tinha essa trava.
- **O 3º critério da #1938** ("sem equivalência direta, adicionar configuração TI mínima")
  ficou assim: a conclusão de tarefas tem equivalência direta, faltava só quem concedesse, e é
  ela que ganhou a configuração; Alteração de regime e Updates, que não têm equivalência,
  não ganharam configuração porque não há operação no Office para proteger.
- **Sem o acesso, o comportamento não muda:** concluir vira solicitação, que um usuário com o
  acesso aprova. A tela de TI só concede e revoga.
- **Sessão:** o serviço de tarefas lê o acesso no banco a cada conclusão, então a mudança vale na
  hora; a sessão de quem perdeu o acesso não é derrubada.
- **Alteração de regime e Updates** não ganharam configuração: não há operação no Office para
  proteger. Voltam quando os fluxos forem construídos.
