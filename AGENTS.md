# AGENTS.md

Instrucoes do Codex para este repositorio.

## Fonte das regras
- As regras originais do Cursor ficam em `.cursor/rules/` e devem ser preservadas.
- As regras adaptadas para o Codex ficam em `.codex/rules/`.
- A configuracao de escopo fica em `.codex/config.toml`.

## Como aplicar
- Sempre aplique `.codex/rules/default.rules.md`.
- Antes de alterar arquivos, consulte `.codex/config.toml` e carregue os arquivos de `.codex/rules/` cujo `paths` combine com a tarefa.
- Quando houver conflito entre regra global e regra especifica, prefira a regra especifica.
- Responda sempre em portugues neste workspace.

