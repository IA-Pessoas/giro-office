import { ServiceError } from "@workspace/shared/http";

// Mesma API oficial, variaveis (CNPJ_LOOKUP_API_URL, CNPJ_LOOKUP_API_TOKEN) e formato de resposta de
// services/client-service/src/services/cnpjLookupService.ts. Diferente do Node: sem provedor
// configurado, ou com ele fora do ar (ex.: HTTP 530 da Cloudflare), cai na BrasilAPI, publica.
// ponytail: sem cache; Cache API nao grava em *.workers.dev, cachear exige binding KV.
const PUBLIC_PROVIDER_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}";
// O fetch do Worker nao manda User-Agent e a BrasilAPI recusa chamadas sem ele.
const USER_AGENT = "giro-office-client-worker/1.0";
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

// "RUA" + "X" + "123" + "SALA 4" -> "RUA X, 123 - SALA 4" (formato BrasilAPI).
function streetAddress(address: ProviderRecord) {
  const street = [
    readString(address, "descricao_tipo_de_logradouro"),
    readString(address, "logradouro"),
  ]
    .filter(Boolean)
    .join(" ");
  if (!street) return null;
  const number = readString(address, "numero");
  const complement = readString(address, "complemento");
  return `${street}${number ? `, ${number}` : ""}${complement ? ` - ${complement}` : ""}`;
}

function cnae(record: ProviderRecord) {
  const text = readString(record, "cnae", "cnae_fiscal_descricao");
  const code = record.cnae_fiscal;
  if (text && (typeof code === "number" || typeof code === "string") && String(code).trim()) {
    return `${code} - ${text}`;
  }
  return text;
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
    address: readString(address, "address") ?? streetAddress(address),
    cep: readString(address, "cep", "zip_code", "zipCode"),
    neighborhood: readString(address, "neighborhood", "bairro"),
    state: readString(address, "state", "uf"),
    city: readString(address, "city", "municipio", "cidade"),
    cnae: cnae(record),
  };
}

function providerUrl(apiUrl: string, cnpj: string) {
  return apiUrl.includes("{cnpj}")
    ? apiUrl.replace("{cnpj}", encodeURIComponent(cnpj))
    : `${apiUrl.replace(/\/$/u, "")}/${encodeURIComponent(cnpj)}`;
}

// null = provedor indisponivel; o chamador tenta o proximo.
async function queryProvider(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { ...headers, "User-Agent": USER_AGENT } });
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
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    console.error("cnpj lookup: provider answered invalid JSON", new URL(url).host, error);
    return null;
  }
}

export async function lookupOfficialCnpj(
  cnpj: string,
  apiUrl: string | undefined,
  apiToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
) {
  if (Boolean(apiUrl) !== Boolean(apiToken)) {
    console.error("cnpj lookup: CNPJ_LOOKUP_API_URL e CNPJ_LOOKUP_API_TOKEN precisam vir juntos");
  }
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
