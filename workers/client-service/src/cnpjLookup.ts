import { ServiceError } from "@workspace/shared/http";

// Paridade com services/client-service/src/services/cnpjLookupService.ts: mesma API oficial,
// mesmas variaveis (CNPJ_LOOKUP_API_URL, CNPJ_LOOKUP_API_TOKEN) e o mesmo formato de resposta.

type ProviderRecord = Record<string, unknown>;

function readString(record: ProviderRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function mapProviderResponse(payload: unknown, cnpj: string) {
  const data =
    payload !== null && typeof payload === "object" && "data" in payload
      ? (payload as { data: unknown }).data
      : payload;
  const record = data !== null && typeof data === "object" ? (data as ProviderRecord) : {};
  const nested = record.address ?? record.endereco;
  const address =
    nested !== null && typeof nested === "object" ? (nested as ProviderRecord) : record;
  const companyName = readString(record, "company_name", "razao_social", "razaoSocial");
  const fantasyName = readString(record, "fantasy_name", "nome_fantasia", "nomeFantasia");

  return {
    cnpj,
    name: readString(record, "name", "nome") ?? companyName ?? fantasyName,
    company_name: companyName,
    fantasy_name: fantasyName,
    opening_date: readString(record, "opening_date", "data_abertura", "dataAbertura"),
    address: readString(address, "address", "logradouro"),
    cep: readString(address, "cep", "zip_code", "zipCode"),
    neighborhood: readString(address, "neighborhood", "bairro"),
    state: readString(address, "state", "uf"),
    city: readString(address, "city", "municipio", "cidade"),
  };
}

export async function lookupOfficialCnpj(
  cnpj: string,
  apiUrl: string | undefined,
  apiToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
) {
  if (!apiUrl || !apiToken) {
    throw new ServiceError(503, "Consulta oficial de CNPJ indisponível.");
  }
  const url = apiUrl.includes("{cnpj}")
    ? apiUrl.replace("{cnpj}", encodeURIComponent(cnpj))
    : `${apiUrl.replace(/\/$/u, "")}/${encodeURIComponent(cnpj)}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` },
    });
  } catch (error) {
    console.error("cnpj lookup: provider unreachable", error);
    throw new ServiceError(502, "O provedor oficial de CNPJ não respondeu (falha de rede).");
  }
  if (!response.ok) {
    console.error("cnpj lookup: provider answered", response.status);
    if (response.status === 404) {
      throw new ServiceError(404, "CNPJ não encontrado na base oficial.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ServiceError(
        502,
        `O provedor oficial de CNPJ recusou a credencial (HTTP ${response.status}).`,
      );
    }
    throw new ServiceError(
      502,
      `O provedor oficial de CNPJ não respondeu corretamente (HTTP ${response.status}).`,
    );
  }
  return mapProviderResponse(await response.json(), cnpj);
}
