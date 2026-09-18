import { setupAPIClient } from "@shared/services/api";

export type TriageCatalogKind = "JUSTIFICATION" | "LINK_TYPE" | "DELIVERY_METHOD" | "STATE_SITE";

export type TriageCatalogItem = {
  id: string;
  kind: TriageCatalogKind;
  code: string;
  label: string;
  url: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TriageCatalogInput = {
  kind: TriageCatalogKind;
  code: string;
  label: string;
  url?: string | null;
};

export type TriageCatalogListParams = {
  kind?: TriageCatalogKind;
  clientId?: string;
  competence?: string;
};

const TRIAGEM_CATALOGS_ENDPOINT = "/triagem/catalogs";

function unwrap<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export const triagemCatalogService = {
  async list(params: TriageCatalogListParams = {}): Promise<TriageCatalogItem[]> {
    const response = await setupAPIClient().get(TRIAGEM_CATALOGS_ENDPOINT, {
      params: {
        ...(params.kind ? { kind: params.kind } : {}),
        ...(params.clientId ? { client_id: params.clientId } : {}),
        ...(params.competence ? { competence: params.competence } : {}),
      },
    });
    return unwrap<TriageCatalogItem[]>(response.data);
  },

  async create(input: TriageCatalogInput): Promise<TriageCatalogItem> {
    const response = await setupAPIClient().post(TRIAGEM_CATALOGS_ENDPOINT, input);
    return unwrap<TriageCatalogItem>(response.data);
  },

  async update(id: string, input: Partial<TriageCatalogInput>): Promise<TriageCatalogItem> {
    const response = await setupAPIClient().patch(`${TRIAGEM_CATALOGS_ENDPOINT}/${id}`, input);
    return unwrap<TriageCatalogItem>(response.data);
  },

  async archive(id: string): Promise<TriageCatalogItem> {
    const response = await setupAPIClient().patch(
      `${TRIAGEM_CATALOGS_ENDPOINT}/${id}/archive`,
    );
    return unwrap<TriageCatalogItem>(response.data);
  },
};
