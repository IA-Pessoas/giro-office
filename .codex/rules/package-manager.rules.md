# Package Manager

Fonte: regras globais do Workspace.

- Este repositorio usa pnpm workspace.
- Preserve os scripts e comandos no formato pnpm ja usado no pacote alterado.
- Para rodar testes de um pacote, prefira `pnpm --filter @workspace/<nome-do-pacote> test`.
- Para services com Prisma gerado, respeite os scripts `prisma:generate`, `prebuild`, `predev`, `build` e `typecheck` descritos em `deploy-service-build.rules.md`.
- Type-check continua separado com `tsc --noEmit` ou script equivalente quando o pacote ja seguir esse padrao.

