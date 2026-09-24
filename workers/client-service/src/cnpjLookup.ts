import { ServiceError } from "@workspace/shared/http";

// Paridade com services/client-service/src/services/cnpjLookupService.ts: mesma API oficial,
// mesmas variaveis (CNPJ_LOOKUP_API_URL, CNPJ_LOOKUP_API_TOKEN) e o mesmo formato de resposta.
// Sem provedor configurado, ou com ele fora do ar (ex.: HTTP 530 da Cloudflare), cai na BrasilAPI,
// publica e sem credencial.
const PUBLIC_PROVIDER_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}";
const UNAVAILABLE_MESSAGE =
  "Não foi possível consultar o CNPJ agora. Tente novamente em instantes ou preencha os dados manualmente.";

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
    opening_date: readString(
      record,
      "opening_date",
      "data_abertura",
      "dataAbertura",
      "data_inicio_atividade",
    ),
    address: readString(address, "address", "logradouro"),
    cep: readString(address, "cep", "zip_code", "zipCode"),
    neighborhood: readString(address, "neighborhood", "bairro"),
    state: readString(address, "state", "uf"),
    city: readString(address, "city", "municipio", "cidade"),
  };
}

function providerUrl(apiUrl: string, cnpj: string) {
  return apiUrl.includes("{cnpj}")
    ? apiUrl.replace("{cnpj}", encodeURIComponent(cnpj))
    : `${apiUrl.replace(/\/$/u, "")}/${encodeURIComponent(cnpj)}`;
}

// null = provedor indisponivel; o chamador tenta o proximo.
async function queryProvider(url: string, headers: HeadersInit, fetchImpl: typeof fetch) {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (error) {
    console.error("cnpj lookup: provider unreachable", new URL(url).host, error);
    return null;
  }
  if (response.status === 404) {
    throw new ServiceError(404, "CNPJ não encontrado na base oficial.");
  }
  if (!response.ok) {
    console.error("cnpj lookup: provider answered", new URL(url).host, response.status);
    return null;
  }
  return response.json() as Promise<unknown>;
}

export async function lookupOfficialCnpj(
  cnpj: string,
  apiUrl: string | undefined,
  apiToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
) {
  const payload =
    (apiUrl && apiToken
      ? await queryProvider(
          providerUrl(apiUrl, cnpj),
          { Accept: "application/json", Authorization: `Bearer ${apiToken}` },
          fetchImpl,
        )
      : null) ??
    (await queryProvider(
      providerUrl(PUBLIC_PROVIDER_URL, cnpj),
      { Accept: "application/json" },
      fetchImpl,
    ));
  if (payload === null) throw new ServiceError(502, UNAVAILABLE_MESSAGE);
  return mapProviderResponse(payload, cnpj);
}
