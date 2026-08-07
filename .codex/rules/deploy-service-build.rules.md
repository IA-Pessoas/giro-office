Fonte original: .cursor/rules/deploy-service-build.mdc

Metadados originais do Cursor:
System.Object[]

# Deploy e Build de Services

## Services com Prisma

Ao adicionar ou padronizar um microservice que importe Prisma gerado, verifique o build em ambiente limpo.

Sinais de que o service depende de Prisma gerado:
- imports de `src/generated/prisma` ou `../generated/prisma`
- uso de `PrismaClient`, modelos Prisma ou enums Prisma dentro de `services/<service>/src`
- entrada em `prismaOutputPath` no `scripts/service-registry.mjs`

Nesses casos, o `services/<service>/package.json` deve seguir o padrao dos services Prisma:

```json
{
  "scripts": {
    "prisma:generate": "node ../../scripts/prisma-generate.mjs",
    "prebuild": "pnpm prisma:generate",
    "predev": "pnpm prisma:generate",
    "build": "tsc",
    "typecheck": "pnpm prisma:generate && tsc --noEmit"
  }
}
```

Nao use apenas `build: "tsc"` em service que depende de `src/generated/prisma`, porque Docker/CI parte de workspace limpo e o client gerado pode nao existir.

## Verificacao obrigatoria

Antes de considerar deploy pronto para um service Prisma:

1. Remova ou ignore a existencia local de `services/<service>/src/generated/prisma`.
2. Rode `pnpm turbo run build --filter=@workspace/<service>`.
3. Confirme que o log mostra `prebuild` -> `prisma:generate` antes do `tsc`.
4. Rode `pnpm --filter @workspace/<service> typecheck` quando o service tiver script `typecheck`.

Se o build so passa porque `src/generated/prisma` ja existia localmente, a padronizacao ainda esta incompleta.

