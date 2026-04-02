# Plano: wrapper `useFetch` para TanStack Query (revisão consolidada)

## Objetivo

Padronizar leituras com um hook fino em cima de `useQuery`, sempre com **`queryFn: () => Promise<...>`** (execução lazy), e serviços em **`@workspace/api`** sem React, com client HTTP injetado.

---

## Avaliação arquitetural: cosmética ou real?

A mudança é **predominantemente cosmética** em comportamento (o TanStack Query continua a ser o motor), mas oferece valor em **governança**:

**Prós**

- Ponto único para **defaults globais** opcionais (`staleTime`, `retry`, etc.) — só se a equipa decidir aplicá-los no wrapper.
- **Padronização de nome** e contrato mental: leituras → `useFetch` / camada de infra.
- **Força o padrão correcto** de `queryFn` como função, reduzindo o erro de instanciar `Promise` no render.

**Contras**

- Camada extra nos stack traces.
- Risco de **falsa padronização** se parte do código ignorar o wrapper em cenários complexos sem critério documentado.

**Valor explícito além de “renomear `useQuery`”**

1. Um sítio para evoluir política de cache da app sem caçar `useQuery` por todo o lado.
2. Documentação viva: “leituras passam por aqui” + regras de `queryFn`.
3. Tipagem alinhada aos **quatro genéricos** do v5, mantendo paridade com a API do TanStack (incl. `select`).

---

## 1. Hook genérico — [`app/src/shared/hooks/useFetch.ts`](app/src/shared/hooks/useFetch.ts)

O parâmetro crítico é **`queryFn: () => Promise<TQueryFnData>`**: função invocada pelo React Query quando apropriado, não uma Promise já criada no render.

**Assinatura técnica recomendada (TanStack Query v5)** — expõe `TQueryFnData`, `TError`, `TData` e `TQueryKey` para não limitar `select`, erros tipados nem keys tipadas:

```ts
import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

export function useFetch<
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryKey: TQueryKey,
  queryFn: () => Promise<TQueryFnData>,
  options?: Omit<
    UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData, TError> {
  return useQuery<TQueryFnData, TError, TData, TQueryKey>({
    queryKey,
    queryFn,
    ...options,
  });
}
```

| Genérico         | Papel |
|------------------|--------|
| `TQueryFnData`   | Tipo bruto devolvido pela `queryFn` (resposta da API / serviço). |
| `TError`         | Tipo do erro (padrão `Error`). |
| `TData`          | Tipo final consumido — **essencial com `select`**. |
| `TQueryKey`      | Key de cache alinhada com o TanStack. |

- **`Omit<..., "queryKey" | "queryFn">`** — evita sobrescrita ambígua e conflitos de tipo.
- Comentário curto no ficheiro: **arrow function** quando há parâmetros dinâmicos (`userId`, filtros); serviços em `@workspace/api`.

**Nota de implementação:** se o pacote exportar um tipo de erro por defeito (`DefaultError`), avaliar alinhar `TError` a esse tipo em vez de `Error` fixo — desde que não quebre inferência.

---

## 2. Serviço em `@workspace/api`

Funções **async**, sem React, dados normalizados.

**Padrão do repositório:** injeção do client — ex. [`getUserById(client, id)`](packages/api/src/services/userService.ts). No hook (ou hook de domínio):

```ts
() => getUserById(api, userId!)
```

Exemplos com `api` global dentro do pacote são só didáticos; **não** são o alvo deste plano.

---

## 3. Estratégia de uso: infraestrutura vs. domínio

**Padrão preferencial**

- Componentes de produto usam **hooks de domínio** (`useUserProfile`, etc.).
- Hooks de domínio usam **`useFetch` internamente**.
- **`useFetch`** = infraestrutura partilhada, **não** a linguagem principal da UI.

**Motivos:** significado de domínio, `queryKey` e injeção do client centralizados, refactors e testes mais simples, menos acoplamento visual ao TanStack na maior parte do código.

**Excepção**

- `useFetch` **directo** em componentes: permitido para **prototipagem**, telas triviais ou casos mínimos — deve ser **excepção**, não regra.

**Política explícita (repositório)**

| Camada              | Uso |
|---------------------|-----|
| `useFetch`          | Infra + implementação de hooks de domínio. |
| Hooks de domínio    | Face pública para features e páginas. |
| `useQuery` directo  | **Só** casos avançados ou excepcionais (ex. opções/experimentação onde o wrapper atrapalha), com justificação em review. |

**Condições mínimas para aprovação do PR**

1. Tipagem com suporte a **`TError`**, **`TData`**, **`TQueryKey`** e **`select`** (assinatura de quatro genéricos acima).
2. O wrapper **não degrada** a API do TanStack: repasse completo de `options` via spread, sem listas manuais incompletas.
3. Política de uso **documentada** (neste plano + comentário breve no `useFetch` ou guia interno da equipa): infra + domínio; `useQuery` só quando faz sentido.
4. **Valor além do rename** explícito (secção “Avaliação arquitetural” / governança e defaults futuros).

---

## 4. Exemplos

**Hook de domínio (recomendado)**

```ts
export function useUserProfile(userId: string | undefined) {
  return useFetch<UserItem>(
    ["user", "profile", userId],
    () => getUserById(api, userId!),
    { enabled: Boolean(userId), staleTime: 1000 * 60 },
  );
}
```

**Uso no componente**

```ts
const { data, error, isPending, isError, refetch } = useUserProfile(userId);
```

**Com `select` (tipagem `TData` ≠ `TQueryFnData`)**

```ts
useFetch<UserItem, Error, Pick<UserItem, "id" | "name">>(
  ["user", "profile", userId],
  () => getUserById(api, userId!),
  {
    enabled: Boolean(userId),
    select: (u) => ({ id: u.id, name: u.name }),
  },
);
```

O resultado exposto é **`UseQueryResult<TData, TError>`** (ex.: `isPending`, `refetch`, `status`, etc.), igual ao `useQuery`.

---

## 5. Integração no repo

1. Criar `useFetch.ts` com a assinatura de quatro genéricos e exportar em [`app/src/shared/hooks/index.ts`](app/src/shared/hooks/index.ts).
2. Refactorizar [`useUserProfile.ts`](app/src/shared/hooks/useUserProfile.ts) para delegar em `useFetch`, mantendo `queryKey`, `enabled` e `queryFn` actuais.
3. Páginas que já usam `useUserProfile` **sem alteração** de comportamento.
4. **Novas queries:** preferir **novo hook de domínio** que use `useFetch`; uso directo de `useFetch` em páginas só nas excepções acordadas.

**Estratégia Git:** um commit por etapa abaixo (mensagens em inglês); mesmo mudanças pequenas ficam isoladas para histórico e revert simples.

---

## 5.1 Git: commits por etapa (English)

Seguir esta ordem. Ajustar o *scope* ao Conventional Commits do repo, se for diferente. Cada linha = um commit (fatias pequenas); podes fundir passos adjacentes se preferires menos ruído no histórico.

| Step | Commit message (subject line) |
|------|-------------------------------|
| 1 | `feat(shared/hooks): scaffold useFetch module for TanStack Query` |
| 2 | `feat(shared/hooks): implement useFetch with full v5 generics` |
| 3 | `docs(shared/hooks): document lazy queryFn and service calls on useFetch` |
| 4 | `docs(shared/hooks): document infra vs domain hook policy on useFetch` |
| 5 | `feat(shared/hooks): export useFetch from shared hooks barrel` |
| 6 | `refactor(shared/hooks): delegate useUserProfile to useFetch` |
| 7 | `refactor(shared/hooks): drop useQuery import from useUserProfile` |
| 8 | `chore(app): verify TypeScript after useFetch introduction` |
| 9 | `test(app): add compile-time check for useFetch with select` |

**Notas**

- **1–2:** Se o ficheiro for criado já completo num único passo, fundir 1+2 num commit: `feat(shared/hooks): add useFetch wrapper with full v5 generics`.
- **3–4:** Podem ser um único `docs(shared/hooks): document useFetch usage and policy` se quiseres menos commits.
- **6–7:** Normalmente um só commit (o refactor remove o `useQuery` ao mesmo tempo).
- **8:** Só faz sentido com diff (ex. `tsconfig`, scripts) ou registo no PR; evitar *empty commit*.

**Corpo opcional (feat useFetch)** — exemplo:

```
Add a thin useQuery wrapper with TQueryFnData, TError, TData, TQueryKey
so select and typed errors stay aligned with TanStack Query v5.
```

**Corpo opcional (refactor useUserProfile)** — exemplo:

```
Preserve query key, enabled flag, and getUserById(api, id) behavior.
```

---

## 6. Aderência, riscos e mitigação

- **`() => Promise<TQueryFnData>`:** correcto; evita execução ansiosa de Promises no render.
- **Perda de poder do TanStack:** mitigada pela tipagem completa e pelo spread de `options` (`enabled`, `placeholderData`, `initialData`, etc.).
- **Repositório híbrido:** mitigado por disciplina + política explícita (`useQuery` só casos avançados).

---

## 7. Fora de âmbito (outro PR)

- Wrapper para **`useMutation`**.
- Mudar convenção dos services ou contratos de rota.

---

## Checklist

- [x] `useFetch` com quatro genéricos + `useQuery<...>` explícito no return
- [x] `Omit<UseQueryOptions<...>, "queryKey" | "queryFn">`
- [x] Export no barrel de hooks
- [x] `useUserProfile` delega em `useFetch`
- [x] Comentário no `useFetch`: arrow function, `@workspace/api`, política (infra / domínio)
- [x] Validar tipos com **`select`**: [`app/src/shared/hooks/useFetch.types.test.ts`](app/src/shared/hooks/useFetch.types.test.ts) + `pnpm run typecheck:usefetch` no pacote `app`
- [x] Commits em inglês por etapa (3 commits aplicados: useFetch, barrel, useUserProfile; ver secção **5.1** para fatias adicionais opcionais)

**Commits aplicados no repo**

1. `feat(shared/hooks): add useFetch TanStack wrapper with v5 generics`
2. `feat(shared/hooks): export useFetch from shared hooks barrel`
3. `refactor(shared/hooks): delegate useUserProfile to useFetch`
4. `test(app): add compile-time check for useFetch with select`
