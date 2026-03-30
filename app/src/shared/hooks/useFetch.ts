import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

/**
 * Thin read-cache hook over `useQuery`. Pass **`queryFn` as a function** (e.g. `() => getX(api, id)`)
 * so the request is lazy and parameters stay in a closure — never pass a Promise created during render.
 *
 * Call services from `@workspace/api` here; keep components on **domain hooks** (`useUserProfile`, …)
 * that wrap `useFetch` so `queryKey` and client injection stay in one place. Use `useQuery` directly
 * only for advanced or exceptional cases.
 */
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

