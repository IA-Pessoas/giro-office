# Final fix report — issue #515

## Finding

O snapshot normalizado guardava `rh` e `ti` como Viewer (`0`), mas o cálculo de `isDirty`
perdia a baseline persistida `null`/ausente. Para um usuário do próprio departamento com acesso
global `-1`, `needsDepartmentPermissionSync` comparava esse acesso com o Viewer normalizado e
marcava a tela como alterada sem edição.

## RED

Teste comportamental adicionado em `app/src/modules/users/run-users-tests.mjs` para RH e TI. O
teste combina a normalização da resposta, a criação do snapshot, a igualdade draft/snapshot e
`needsDepartmentPermissionSync`. Um segundo cenário protege a detecção de sincronização realmente
obsoleta quando Viewer (`0`) já estava persistido.

Comando:

```text
pnpm --filter @workspace/app test:users
```

Resultado antes da correção: exit code `1`.

```text
FAIL legacy minimum normalization does not request RH or Technology department sync
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
true !== false
```

## GREEN

A correção passa a aceitar a baseline bruta como contexto opcional de
`needsDepartmentPermissionSync`. A divergência é suprimida somente quando:

- o módulo possui mínimo configurado;
- a baseline do módulo era `null` ou ausente;
- o draft permanece exatamente no mínimo normalizado; e
- o acesso global ainda corresponde à baseline sem acesso.

`Administracao.tsx` mantém essa baseline junto do snapshot e a fornece apenas ao cálculo de
`isDirty`. O caminho de save continua chamando a sincronização sem a exceção de baseline, portanto
uma edição real preserva o comportamento de sincronização existente.

Comando:

```text
pnpm --filter @workspace/app test:users
```

Resultado após a correção: exit code `0`; todos os testes do runner passaram, incluindo:

```text
PASS legacy minimum normalization does not request RH or Technology department sync
PASS persisted Viewer still detects stale RH or Technology department sync
```

O runner emite o aviso preexistente `MODULE_TYPELESS_PACKAGE_JSON`, sem falha.

## Validação complementar

### Typecheck

Comando:

```text
pnpm --filter @workspace/app typecheck
```

Resultado: exit code `2`, classificado como falha de baseline já documentada. Foram emitidos
somente cinco erros `TS2307` de resolução de `@workspace/api`:

```text
src/shared/hooks/useMe.ts
src/shared/hooks/useMeMutations.ts
src/shared/hooks/useUpdateCurrentUser.ts
src/shared/hooks/useUserProfile.ts
src/shared/services/api.ts
```

Nenhum erro novo foi reportado nos arquivos alterados.

### Biome

Comando:

```text
pnpm exec biome check app/src/modules/users/run-users-tests.mjs app/src/modules/users/utils/createUserPayload.ts app/src/shared/components/newLayout/Administracao.tsx
```

Resultado: exit code `1`; a configuração atual ignorou os três caminhos e processou zero arquivos.
Nenhuma correção automática foi aplicada.

### Higiene e revisão

```text
git diff --check
```

Resultado: exit code `0`, sem saída.

Os call sites de `needsDepartmentPermissionSync` foram revisados: somente o cálculo de `isDirty`
recebe a baseline; o fluxo de save e os demais consumidores preservam a assinatura opcional e o
comportamento anterior.
