import type { PessoalUnion, PessoalUnionPayload } from "../types/unions";

async function getPessoalHttp() {
  const [{ setupAPIClient }, contract] = await Promise.all([
    import("@shared/services/api"),
    import("./pessoalService.contract"),
  ]);

  return {
    api: setupAPIClient(),
    ...contract,
  };
}

export function buildPessoalUnionPayload(payload: PessoalUnionPayload): PessoalUnionPayload {
  return {
    name: payload.name,
    cnpj: payload.cnpj,
    base_date: typeof payload.base_date === "undefined" ? null : payload.base_date,
  };
}

export const pessoalService = {
  async listUnions(): Promise<PessoalUnion[]> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.unions);

    return unwrapPessoalEnvelope<PessoalUnion[]>(response.data);
  },

  async detailUnion(id: string): Promise<PessoalUnion> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.unionDetail(id));

    return unwrapPessoalEnvelope<PessoalUnion>(response.data);
  },

  async createUnion(payload: PessoalUnionPayload): Promise<PessoalUnion> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.post(PESSOAL_ENDPOINTS.unions, buildPessoalUnionPayload(payload));

    return unwrapPessoalEnvelope<PessoalUnion>(response.data);
  },

  async updateUnion(id: string, payload: PessoalUnionPayload): Promise<PessoalUnion> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.patch(
      PESSOAL_ENDPOINTS.unionDetail(id),
      buildPessoalUnionPayload(payload),
    );

    return unwrapPessoalEnvelope<PessoalUnion>(response.data);
  },
};
