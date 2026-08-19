export type TenantTransaction = {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

export type TenantTransactionClient = {
  $transaction<T>(action: (transaction: TenantTransaction) => Promise<T>): Promise<T>;
};

export async function withTenantTransaction<T>(
  client: TenantTransactionClient,
  organizationId: string,
  action: (transaction: TenantTransaction) => Promise<T>,
): Promise<T> {
  return await client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return await action(transaction);
  });
}
