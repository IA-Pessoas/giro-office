import { ServiceError } from "@workspace/shared";

import type { ClientServiceEnv } from "../config/env.js";
import { cleanCnpjDocument } from "../utils/documents.js";

export interface CnpjCompanyLookup {
  cnpj: string;
  name: string | null;
  company_name: string | null;
  fantasy_name: string | null;
  opening_date: string | null;
  address: string | null;
  cep: string | null;
  neighborhood: string | null;
  state: string | null;
  city: string | null;
}

export interface CnpjLookupProvider {
  lookup(cnpj: string): Promise<CnpjCompanyLookup>;
}

type ProviderRecord = Record<string, unknown>;

function readString(record: ProviderRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readAddress(record: ProviderRecord): ProviderRecord {
  const address = record.address ?? record.endereco;
  return address !== null && typeof address === "object" ? (address as ProviderRecord) : record;
}

function mapProviderResponse(payload: unknown, cnpj: string): CnpjCompanyLookup {
  const data =
    payload !== null && typeof payload === "object" && "data" in payload
      ? (payload as { data: unknown }).data
      : payload;
  const record = data !== null && typeof data === "object" ? (data as ProviderRecord) : {};
  const address = readAddress(record);
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

export class OfficialCnpjLookupProvider implements CnpjLookupProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async lookup(cnpj: string): Promise<CnpjCompanyLookup> {
    if (!this.apiUrl || !this.apiToken) {
      throw new ServiceError(503, "Consulta oficial de CNPJ indisponível.");
    }

    const url = this.apiUrl.includes("{cnpj}")
      ? this.apiUrl.replace("{cnpj}", encodeURIComponent(cnpj))
      : `${this.apiUrl.replace(/\/$/, "")}/${encodeURIComponent(cnpj)}`;
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      throw new ServiceError(502, "O provedor oficial de CNPJ não respondeu corretamente.");
    }

    return mapProviderResponse(await response.json(), cnpj);
  }
}

export function createCnpjLookupProvider(env: ClientServiceEnv): CnpjLookupProvider {
  return new OfficialCnpjLookupProvider(env.cnpjLookupApiUrl, env.cnpjLookupApiToken);
}

export function normalizeLookupCnpj(value: string): string {
  return cleanCnpjDocument(value);
}

export function validateLookupCnpj(value: string): string {
  const normalized = normalizeLookupCnpj(value);

  if (!/^[A-Z0-9]{14}$/.test(normalized)) {
    throw new ServiceError(400, "CNPJ deve conter 14 caracteres alfanuméricos.");
  }

  return normalized;
}
