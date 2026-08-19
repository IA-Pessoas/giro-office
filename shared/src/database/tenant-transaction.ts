export type TenantTransaction = {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

export type TenantTransactionClient<TTransaction extends TenantTransaction> = {
  $transaction<T>(action: (transaction: TTransaction) => Promise<T>): Promise<T>;
};

export async function withTenantTransaction<TTransaction extends TenantTransaction, TResult>(
  client: TenantTransactionClient<TTransaction>,
  organizationId: string,
  action: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return await client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return await action(transaction);
  });
}
