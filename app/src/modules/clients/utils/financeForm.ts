import type { Client, ClientFinanceFormValues, UpdateClientFinancePayload } from "../types";

export function createFinanceInitialValues(client: Client): ClientFinanceFormValues {
  return {
    contract: Boolean(client.contract),
  };
}

export function buildFinancePayload(
  values: ClientFinanceFormValues,
  _client: Client,
): UpdateClientFinancePayload {
  return {
    contract: values.contract,
  };
}

export function hasFinanceChanges(values: ClientFinanceFormValues, client: Client): boolean {
  return values.contract !== Boolean(client.contract);
}
