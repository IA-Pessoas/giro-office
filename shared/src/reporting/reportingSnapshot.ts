import { ServiceError } from "../http/errors.js";

/** Keep every page (and every derived source) in the same database snapshot. */
export async function withReportingSnapshot<Client extends object, Result>(
  client: Client,
  read: (transaction: Client) => Promise<Result>,
): Promise<Result> {
  if (!("$transaction" in client) || typeof client.$transaction !== "function") {
    throw new ServiceError(503, "A origem não oferece leitura consistente para relatórios.");
  }
  return client.$transaction(read, {
    isolationLevel: "RepeatableRead",
    maxWait: 5_000,
    timeout: 30_000,
  });
}
