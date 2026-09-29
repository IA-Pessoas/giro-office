type MarketingQueryIdentity = {
  id?: string | null;
  organization_id?: string | null;
} | null | undefined;

export function marketingQueryKey<TKey extends readonly unknown[]>(
  queryKey: TKey,
  user: MarketingQueryIdentity,
): [...TKey, string | null, string | null] {
  return [...queryKey, user?.organization_id ?? null, user?.id ?? null];
}
