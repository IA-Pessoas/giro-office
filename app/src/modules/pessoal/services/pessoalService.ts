import type {
  PessoalObligation,
  PessoalObligationCreatePayload,
  PessoalObligationCreateResult,
  PessoalObligationGenerationResult,
  PessoalObligationUpdatePayload,
} from "../types/obligations";
import type { PessoalPayroll, PessoalPayrollPayload } from "../types/payroll";
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

export function buildPessoalPayrollPayload(
  payload: PessoalPayrollPayload,
): PessoalPayrollPayload {
  return {
    client_id: payload.client_id,
    responsible_id: payload.responsible_id ?? null,
    advance: payload.advance,
    advance_type: payload.advance_type ?? null,
    advance_amount: payload.advance_amount ?? null,
    info: payload.info,
    previous: payload.previous,
    onvio: payload.onvio,
    group: payload.group,
    vt: payload.vt,
    vt_value: payload.vt_value ?? null,
    vt_type: payload.vt_type ?? null,
    va: payload.va,
    assistance_fee: payload.assistance_fee,
    union_id: payload.union_id ?? null,
    bem_mais: payload.bem_mais,
    bsf: payload.bsf,
    reinf: payload.reinf,
    employees: payload.employees,
    contact: payload.contact ?? null,
  };
}

export function buildPessoalPayrollUpdatePayload(
  payload: PessoalPayrollPayload,
): Omit<PessoalPayrollPayload, "client_id"> {
  const { client_id: _clientId, ...body } = buildPessoalPayrollPayload(payload);

  return body;
}

export function buildPessoalObligationParams(
  clientId: string,
  competence: string,
): PessoalObligationCreatePayload {
  return {
    client_id: clientId,
    competence,
  };
}

function isNotFoundError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  );
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

  async detailPayroll(clientId: string): Promise<PessoalPayroll | null> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();

    try {
      const response = await api.get(PESSOAL_ENDPOINTS.payrollDetail(clientId));

      return unwrapPessoalEnvelope<PessoalPayroll>(response.data);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  },

  async createPayroll(payload: PessoalPayrollPayload): Promise<PessoalPayroll> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.post(
      PESSOAL_ENDPOINTS.payroll,
      buildPessoalPayrollPayload(payload),
    );

    return unwrapPessoalEnvelope<PessoalPayroll>(response.data);
  },

  async updatePayroll(
    clientId: string,
    payload: PessoalPayrollPayload,
  ): Promise<PessoalPayroll> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.patch(
      PESSOAL_ENDPOINTS.payrollDetail(clientId),
      buildPessoalPayrollUpdatePayload(payload),
    );

    return unwrapPessoalEnvelope<PessoalPayroll>(response.data);
  },

  async detailObligation(
    clientId: string,
    competence: string,
  ): Promise<PessoalObligation | null> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();

    try {
      const response = await api.get(PESSOAL_ENDPOINTS.obligations, {
        params: buildPessoalObligationParams(clientId, competence),
      });

      return unwrapPessoalEnvelope<PessoalObligation>(response.data);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  },

  async createObligation(
    payload: PessoalObligationCreatePayload,
  ): Promise<PessoalObligationCreateResult> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.post(PESSOAL_ENDPOINTS.obligations, payload);

    return unwrapPessoalEnvelope<PessoalObligationCreateResult>(response.data);
  },

  async updateObligationField(
    id: string,
    payload: PessoalObligationUpdatePayload,
  ): Promise<PessoalObligation> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.patch(PESSOAL_ENDPOINTS.obligationDetail(id), payload);

    return unwrapPessoalEnvelope<PessoalObligation>(response.data);
  },

  async generateObligations(
    competence: string,
  ): Promise<PessoalObligationGenerationResult> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.post(PESSOAL_ENDPOINTS.obligationGenerate(competence));

    return unwrapPessoalEnvelope<PessoalObligationGenerationResult>(response.data);
  },
};
