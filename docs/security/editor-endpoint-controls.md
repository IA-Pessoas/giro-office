# Controles de endpoint e editor

Este repositório mantém a política em
`.github/security/editor-endpoint-policy.json`. Ela define as configurações obrigatórias e
o inventário aprovado de extensões, incluindo responsável, versão mínima, política de
atualização e data de revisão. A equipe de endpoint é dona da distribuição por MDM e da
revisão desses campos.

## Auditoria local

A auditoria é estritamente read-only: lê dados do perfil e do workspace selecionados, mas
nunca executa hooks, configurações, tarefas ou extensões. Ela não altera arquivos, não
remove extensões, não coleta credenciais e não tem opção `--apply`.

Execute com um identificador opaco, definido pela equipe de endpoint, e somente para o
perfil autorizado:

```sh
# Windows
node scripts/developer-endpoint-audit.mjs --platform win32 --home <perfil> --workspace <workspace> --machine-id <id-opaco>

# macOS
node scripts/developer-endpoint-audit.mjs --platform darwin --home <perfil> --workspace <workspace> --machine-id <id-opaco>

# Linux
node scripts/developer-endpoint-audit.mjs --platform linux --home <perfil> --workspace <workspace> --machine-id <id-opaco>
```

O relatório contém apenas IDs de regra, escopos fixos, remediações e contagens. Ele não
inclui caminhos absolutos, diretórios home, nomes de usuário, tokens, valores de
configuração ou o `machine-id`. Para persistir o relatório, forneça explicitamente
`--report <arquivo>`; nenhum arquivo é escrito sem essa opção.

Os controles verificados são `security.workspace.trust.enabled`,
`task.allowAutomaticTasks`, extensões aprovadas e `core.hooksPath`. A regra de autorun
`runOn: folderOpen` continua sendo responsabilidade do scanner versionado:

```sh
node scripts/supply-chain-integrity.mjs
```

## Triagem e remediação

Um alerta ou ticket deve usar um payload sanitizado com o ID opaco da máquina, IDs das
regras, escopos fixos e contagens. Não anexe o relatório de perfil bruto nem caminhos ou
valores locais. A integração com ticketing é uma operação externa; este repositório não
envia tickets.

Antes de qualquer remediação, o operador obtém confirmação explícita do responsável pelo
endpoint. Só então ele pode usar os procedimentos corporativos de MDM para aplicar as
configurações, revisar uma extensão ou tratar um caminho de hooks. Quarentena ou remoção de
extensões também são decisões do operador: esta auditoria nunca as executa.

Para investigar extensão ou configuração suspeita, abra o workspace em **Restricted Mode**
em uma máquina limpa, sem confiar no workspace e sem executar tarefas. Colete apenas a
saída sanitizada da auditoria e encaminhe o ticket/alerta conforme o processo de segurança.
Não use hooks, perfis reais ou configurações da fixture como parte dessa investigação.
