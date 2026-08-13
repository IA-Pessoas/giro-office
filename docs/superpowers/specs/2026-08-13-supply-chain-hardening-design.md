# Supply Chain Security Hardening Design

**Issues:** #771 e #770  
**Escopo:** `IA-Pessoas/giro-office`; as referências a outros repositórios nas issues são tratadas como inventário de rollout, não como local de implementação.

## Objetivo

Adicionar ao repositório um gate determinístico de integridade de supply chain e uma política verificável para rulesets de refs protegidas, sem novas dependências npm, sem executar conteúdo escaneado e sem registrar payloads ou segredos.

## Arquitetura

### #771 — scanner

O scanner será um módulo Node.js baseado apenas na biblioteca padrão. Ele receberá uma raiz de checkout e opções de arquivos alterados, percorrerá somente arquivos relevantes e retornará achados sanitizados com `path`, `ruleId`, `line` ou `blobSha` e orientação de correção. A saída nunca conterá corpo de arquivo, payload decodificado, credencial ou header.

As regras cobrirão os IOC families já conhecidos, configurações executáveis e superfícies de instalação/CI/editor, linhas executáveis acima de 2.000 bytes, magic bytes de `.woff`/`.woff2`, tarefas automáticas e comandos de download/execução. A allowlist será validada com expiração obrigatória e escopo exato; entradas expiradas falharão fechado.

O hook pre-commit e um workflow CI dedicado chamarão a mesma implementação. O workflow terá `contents: read`, não usará segredos de produção e publicará apenas um relatório sanitizado.

### #770 — policy de rulesets

Uma política JSON versionada descreverá os dois rulesets desejados: integridade global de refs e ciclo de vida de refs protegidas. Um verificador Node.js comparará uma exportação normalizada do GitHub com a política, sem criar ou alterar rulesets automaticamente. A política cobrirá force-push/deleção, PR, duas aprovações, Code Owner, status do scanner, conversas resolvidas, aprovação do último push, commits/tags assinados quando suportados e bypass break-glass auditável.

Os testes usarão fixtures locais para configuração aprovada, drift e regras ausentes. A documentação explicará rollout em sandbox, repositório não produtivo e organização, além de rollback limitado a exceções temporárias; a proteção contra force-push/deleção não será removida.

## Dependências e ordem

- #771 é independente e pode ser implementada e mergeada primeiro.
- #770 pode ser preparada em paralelo, mas seu enforcement final exige o check da #771 e a cobertura CODEOWNERS de #769.
- Nenhuma configuração organizacional será aplicada automaticamente durante a implementação ou criação das PRs.

## Segurança e desempenho

- Nenhuma dependência nova.
- Sem `eval`, `exec`, checkout ou execução de código dos arquivos analisados.
- Regexes simples, compiladas uma vez, sem padrões de backtracking catastrófico.
- Percurso linear por arquivo relevante; arquivos grandes serão processados sem duplicar conteúdo desnecessariamente.
- Relatórios redigidos e limitados a metadados seguros.

## Verificação

- Testes unitários e fixtures TDD para cada regra nova.
- Testes existentes de supply chain e hook.
- Validação dos workflows e da política JSON.
- `pnpm check`, `pnpm audit --audit-level moderate`, testes focados e build/typecheck proporcionais.
- Revisão independente antes do push e PRs para `develop`.
