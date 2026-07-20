import type {
  ParcelamentoInstallment,
  ParcelamentoListFilters,
  ParcelamentoPanorama,
} from "../types";
import {
  PARCELAMENTO_ENDPOINTS,
  buildParcelamentoListParams,
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
};
