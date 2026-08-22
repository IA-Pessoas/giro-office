# Database And Audit Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limitar pools Prisma, corrigir o singleton do Audit e tornar a entrega de auditoria resiliente a falhas transitorias.

**Architecture:** Um parser compartilhado aplica o mesmo contrato de `DATABASE_POOL_MAX` a todos os adapters. O Audit possui um cliente por processo e shutdown explicito. O recorder mantem entrega assincrona, com tentativas e capacidade pendente limitadas.

**Tech Stack:** TypeScript, Prisma 7, `@prisma/adapter-pg`, Node test runner, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-22-issues-870-871-872-database-resilience-design.md`

## Global Constraints

- Default de `DATABASE_POOL_MAX` igual a `1` e rejeicao de valores nao inteiros ou menores que 1.
- Nenhum segredo ou URL completa de banco entra no Git ou nos logs.
- Auditoria permanece nao bloqueante para a resposta HTTP.
- Outbox duravel nao faz parte deste patch.

---

### Task 1: Contrato compartilhado de pool

**Files:**
- Create: `shared/src/database/pool.ts`
- Create: `shared/src/database/index.ts`
- Create: `shared/tests/database/pool.test.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/package.json`

- [ ] Escrever testes para default, valor valido e valores invalidos.
- [ ] Confirmar a falha antes da implementacao.
- [ ] Implementar `parseDatabasePoolMax(value, defaultValue)`.
- [ ] Rodar testes e typecheck do Shared.

### Task 2: Aplicar teto e singleton

**Files:**
- Modify: todos os entrypoints Prisma em `services/*/src`
- Modify: `services/audit-service/src/integrations/prisma/prismaClient.ts`
- Modify: `services/audit-service/src/server.ts`
- Test: `services/audit-service/tests/prismaClient.test.ts`

- [ ] Escrever teste que reproduz multiplas instancias em producao.
- [ ] Aplicar `max` a todos os `PrismaPg` usados em runtime.
- [ ] Reutilizar um cliente Audit e adicionar shutdown idempotente.
- [ ] Rodar testes e typechecks escopados.

### Task 3: Retry limitado da auditoria

**Files:**
- Modify: `shared/src/audit/recorder.ts`
- Create: `shared/tests/audit/recorder.test.ts`

- [ ] Escrever testes de sucesso, HTTP nao-OK, rede, backoff, overflow e descarte.
- [ ] Implementar no maximo seis tentativas em 15,5 segundos e limite de pendencias.
- [ ] Garantir que erros definitivos sejam registrados como `error` sem rejeicao nao tratada.
- [ ] Rodar testes Shared e Gateway.

### Task 4: Documentacao e guard-rails

**Files:**
- Modify: `.env.example`
- Modify: `docs/vps-deploy.md`
- Modify: READMEs de servicos afetados quando necessario

- [ ] Documentar budget de 18/20, session vs transaction mode e `DIRECT_URL`.
- [ ] Documentar verificacao de `EMAXCONNSESSION`, descarte e memoria antes/depois.
- [ ] Registrar que pool size e URLs reais sao mudancas externas e nao fazem parte do commit.

### Task 5: Verificacao e publicacao

- [ ] Rodar formatacao, lint, typecheck e testes escopados.
- [ ] Revisar diff e confirmar ausencia de segredos/artefatos gerados.
- [ ] Commitar apenas os arquivos da correcao.
- [ ] Publicar branch e abrir PR draft contra `develop`, vinculando #870, #871 e #872.
