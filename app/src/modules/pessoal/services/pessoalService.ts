import type { PessoalOverviewSummary } from "../types";
import type {
  PessoalObligation,
  PessoalObligationCreatePayload,
  PessoalObligationCreateResult,
  PessoalObligationGenerationResult,
  PessoalObligationUpdatePayload,
} from "../types/obligations";
import type {
  PessoalPasswordDetail,
  PessoalPasswordListItem,
  PessoalPasswordPayload,
  PessoalPasswordUpdatePayload,
} from "../types/passwords";
import type { PessoalPayroll, PessoalPayrollPayload } from "../types/payroll";
import type {
  PessoalLdd,
  PessoalLddListParams,
  PessoalLddPayload,
  PessoalLddUpdatePayload,
  PessoalSituation,
  PessoalSituationPayload,
  PessoalSituationUpdatePayload,
} from "../types/tracking";
import type {
  PessoalUnion,
  PessoalUnionListParams,
  PessoalUnionPayload,
} from "../types/unions";
import type { PaginatedResult } from "@shared/pagination/pagination";

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

export function buildPessoalUnionListParams(params: PessoalUnionListParams) {
  return {
    ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    page: params.page,
    limit: params.limit,
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

export function buildPessoalLddListParams(clientId?: string): PessoalLddListParams {
  const trimmedClientId = clientId?.trim();

  return trimmedClientId ? { client_id: trimmedClientId } : {};
}

const PESSOAL_PASSWORD_SECRET_FIELDS = [
  "login_main",
  "senha_main",
  "login_secondary",
  "senha_secondary",
] as const;

export function hasPessoalPasswordSecretFields(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    PESSOAL_PASSWORD_SECRET_FIELDS.some((field) => field in value)
  );
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
  async getOverview(): Promise<PessoalOverviewSummary> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.overview);

    return unwrapPessoalEnvelope<PessoalOverviewSummary>(response.data);
  },

  async listUnions(): Promise<PessoalUnion[]> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.unions);

    return unwrapPessoalEnvelope<PessoalUnion[]>(response.data);
  },

  async listUnionsPage(
    params: PessoalUnionListParams,
  ): Promise<PaginatedResult<PessoalUnion>> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalPage } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.unions, {
      params: buildPessoalUnionListParams(params),
    });

    return unwrapPessoalPage<PessoalUnion>(response.data, params);
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

  async listLdd(clientId?: string): Promise<PessoalLdd[]> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.ldd, {
      params: buildPessoalLddListParams(clientId),
    });

    return unwrapPessoalEnvelope<PessoalLdd[]>(response.data);
  },

  async createLdd(payload: PessoalLddPayload): Promise<PessoalLdd> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.post(PESSOAL_ENDPOINTS.ldd, payload);

    return unwrapPessoalEnvelope<PessoalLdd>(response.data);
  },

  async updateLdd(id: string, payload: PessoalLddUpdatePayload): Promise<PessoalLdd> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.patch(PESSOAL_ENDPOINTS.lddDetail(id), payload);

    return unwrapPessoalEnvelope<PessoalLdd>(response.data);
  },

  async deleteLdd(id: string): Promise<PessoalLdd> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.delete(PESSOAL_ENDPOINTS.lddDetail(id));

    return unwrapPessoalEnvelope<PessoalLdd>(response.data);
  },

  async listSituations(clientId: string): Promise<PessoalSituation[]> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.situations, {
      params: { client_id: clientId },
    });

    return unwrapPessoalEnvelope<PessoalSituation[]>(response.data);
  },

  async detailSituation(id: string): Promise<PessoalSituation> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.situationDetail(id));

    return unwrapPessoalEnvelope<PessoalSituation>(response.data);
  },

  async createSituation(payload: PessoalSituationPayload): Promise<PessoalSituation> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.post(PESSOAL_ENDPOINTS.situations, {
      client_id: payload.client_id,
      title: payload.title,
      description: payload.description,
    });

    return unwrapPessoalEnvelope<PessoalSituation>(response.data);
  },

  async updateSituation(
    id: string,
    payload: PessoalSituationUpdatePayload,
  ): Promise<PessoalSituation> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.patch(PESSOAL_ENDPOINTS.situationDetail(id), payload);

    return unwrapPessoalEnvelope<PessoalSituation>(response.data);
  },

  async listPasswords(clientId: string): Promise<PessoalPasswordListItem[]> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.passwords, {
      params: { client_id: clientId },
    });

    return unwrapPessoalEnvelope<PessoalPasswordListItem[]>(response.data);
  },

  async detailPassword(id: string): Promise<PessoalPasswordDetail> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.get(PESSOAL_ENDPOINTS.passwordDetail(id));

    return unwrapPessoalEnvelope<PessoalPasswordDetail>(response.data);
  },

  async createPassword(payload: PessoalPasswordPayload): Promise<PessoalPasswordListItem> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.post(PESSOAL_ENDPOINTS.passwords, payload);

    return unwrapPessoalEnvelope<PessoalPasswordListItem>(response.data);
  },

  async updatePassword(
    id: string,
    payload: PessoalPasswordUpdatePayload,
  ): Promise<PessoalPasswordListItem> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.patch(PESSOAL_ENDPOINTS.passwordDetail(id), payload);

    return unwrapPessoalEnvelope<PessoalPasswordListItem>(response.data);
  },

  async deletePassword(id: string): Promise<PessoalPasswordListItem> {
    const { api, PESSOAL_ENDPOINTS, unwrapPessoalEnvelope } = await getPessoalHttp();
    const response = await api.delete(PESSOAL_ENDPOINTS.passwordDetail(id));

    return unwrapPessoalEnvelope<PessoalPasswordListItem>(response.data);
  },
};
