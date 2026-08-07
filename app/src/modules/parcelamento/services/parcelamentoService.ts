import type {
  CreateParcelamentoInstallmentCompetencyPayload,
  CreateParcelamentoInstallmentPayload,
  CreateParcelamentoPanoramaPayload,
  ParcelamentoInstallment,
  ParcelamentoInstallmentCompetency,
  ParcelamentoListFilters,
  ParcelamentoPanorama,
  ParcelamentoPanoramaGenerateResult,
  PatchParcelamentoInstallmentCompetencyPayload,
  PatchParcelamentoInstallmentPayload,
  PatchParcelamentoPanoramaPayload,
} from "../types";
import {
  PARCELAMENTO_ENDPOINTS,
  buildCreateInstallmentCompetencyPayload,
  buildCreateInstallmentPayload,
  buildCreatePanoramaPayload,
  buildParcelamentoListParams,
  buildPatchInstallmentCompetencyPayload,
  buildPatchInstallmentPayload,
  buildPatchPanoramaPayload,
  unwrapParcelamentoEnvelope,
  unwrapParcelamentoPage,
} from "./parcelamentoService.contract";

async function getParcelamentoApi() {
  const { setupAPIClient } = await import("@shared/services/api");

  return setupAPIClient();
}

export const parcelamentoService = {
  async listInstallments(filters: ParcelamentoListFilters = {}) {
    const api = await getParcelamentoApi();
    const response = await api.get(PARCELAMENTO_ENDPOINTS.installments, {
      params: buildParcelamentoListParams(filters),
    });

    return unwrapParcelamentoPage<ParcelamentoInstallment>(response.data);
  },

  async detailInstallment(id: string) {
    const api = await getParcelamentoApi();
    const response = await api.get(PARCELAMENTO_ENDPOINTS.installmentDetail(id));

    return unwrapParcelamentoEnvelope<ParcelamentoInstallment>(response.data);
  },

  async createInstallment(payload: CreateParcelamentoInstallmentPayload) {
    const api = await getParcelamentoApi();
    const response = await api.post(
      PARCELAMENTO_ENDPOINTS.installments,
      buildCreateInstallmentPayload(payload),
    );

    return unwrapParcelamentoEnvelope<ParcelamentoInstallment>(response.data);
  },

  async updateInstallment(id: string, payload: PatchParcelamentoInstallmentPayload) {
    const api = await getParcelamentoApi();
    const response = await api.patch(
      PARCELAMENTO_ENDPOINTS.installmentDetail(id),
      buildPatchInstallmentPayload(payload),
    );

    return unwrapParcelamentoEnvelope<ParcelamentoInstallment>(response.data);
  },

  async listInstallmentCompetencies(
    installmentId: string,
    filters: ParcelamentoListFilters = {},
  ) {
    const api = await getParcelamentoApi();
    const response = await api.get(PARCELAMENTO_ENDPOINTS.installmentCompetencies(installmentId), {
      params: buildParcelamentoListParams(filters),
    });

    return unwrapParcelamentoPage<ParcelamentoInstallmentCompetency>(response.data);
  },

  async createInstallmentCompetency(
    installmentId: string,
    payload: CreateParcelamentoInstallmentCompetencyPayload,
  ) {
    const api = await getParcelamentoApi();
    const response = await api.post(
      PARCELAMENTO_ENDPOINTS.installmentCompetencies(installmentId),
      buildCreateInstallmentCompetencyPayload(payload),
    );

    return unwrapParcelamentoEnvelope<ParcelamentoInstallmentCompetency>(response.data);
  },

  async updateInstallmentCompetency(
    id: string,
    payload: PatchParcelamentoInstallmentCompetencyPayload,
  ) {
    const api = await getParcelamentoApi();
    const response = await api.patch(
      PARCELAMENTO_ENDPOINTS.installmentCompetencyDetail(id),
      buildPatchInstallmentCompetencyPayload(payload),
    );

    return unwrapParcelamentoEnvelope<ParcelamentoInstallmentCompetency>(response.data);
  },

  async listPanoramas(filters: ParcelamentoListFilters = {}) {
    const api = await getParcelamentoApi();
    const response = await api.get(PARCELAMENTO_ENDPOINTS.panoramas, {
      params: buildParcelamentoListParams(filters),
    });

    return unwrapParcelamentoPage<ParcelamentoPanorama>(response.data);
  },

  async detailPanorama(id: string) {
    const api = await getParcelamentoApi();
    const response = await api.get(PARCELAMENTO_ENDPOINTS.panoramaDetail(id));

    return unwrapParcelamentoEnvelope<ParcelamentoPanorama>(response.data);
  },

  async createPanorama(payload: CreateParcelamentoPanoramaPayload) {
    const api = await getParcelamentoApi();
    const response = await api.post(
      PARCELAMENTO_ENDPOINTS.panoramas,
      buildCreatePanoramaPayload(payload),
    );

    return unwrapParcelamentoEnvelope<ParcelamentoPanorama>(response.data);
  },

  async updatePanorama(id: string, payload: PatchParcelamentoPanoramaPayload) {
    const api = await getParcelamentoApi();
    const response = await api.patch(
      PARCELAMENTO_ENDPOINTS.panoramaDetail(id),
      buildPatchPanoramaPayload(payload),
    );

    return unwrapParcelamentoEnvelope<ParcelamentoPanorama>(response.data);
  },

  async generatePanoramas(competence: string) {
    const api = await getParcelamentoApi();
    const response = await api.post(PARCELAMENTO_ENDPOINTS.panoramaGenerate(competence), {});

    return unwrapParcelamentoEnvelope<ParcelamentoPanoramaGenerateResult>(response.data);
  },
};
