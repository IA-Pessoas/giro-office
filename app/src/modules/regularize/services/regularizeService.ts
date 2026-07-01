import { setupAPIClient } from "@shared/services/api";

import type {
  CreateRegularizeClientPfPayload,
  CreateRegularizePartnerPayload,
  CreateRegularizePasswordPayload,
  CreateRegularizeSitePasswordPayload,
  RegularizeClientPfDetail,
  RegularizeClientPfListFilters,
  RegularizeClientPfListItem,
  RegularizeGuidance,
  RegularizeGuidanceListFilters,
  RegularizeId,
  RegularizeLicenseDetail,
  RegularizeLicenseListFilters,
  RegularizeLicenseListItem,
  RegularizeMunicipalTaxesClientSummary,
  RegularizeMunicipalTaxesDetail,
  RegularizeMunicipalTaxesListFilters,
  RegularizePartner,
  RegularizePartnerListFilters,
  RegularizePasswordDetail,
  RegularizePasswordListFilters,
  RegularizePasswordListItem,
  RegularizeProcessDetail,
  RegularizeProcessListFilters,
  RegularizeProcessListItem,
  RegularizeSitePasswordDetail,
  RegularizeSitePasswordListFilters,
  RegularizeSitePasswordListItem,
  UpdateRegularizeClientPfPayload,
  UpdateRegularizePartnerPayload,
  UpdateRegularizePasswordPayload,
  UpdateRegularizeSitePasswordPayload,
} from "../types";
import {
  buildRegularizeClientPfListParams,
  buildRegularizeGuidanceListParams,
  buildRegularizeIdParams,
  buildRegularizeLicenseListParams,
  buildRegularizeMunicipalTaxesListParams,
  buildRegularizePartnerListParams,
  buildRegularizePasswordListParams,
  buildRegularizeProcessListParams,
  buildRegularizeSitePasswordListParams,
  REGULARIZE_ENDPOINTS,
  unwrapRegularizeEntity,
  unwrapRegularizeEnvelope,
} from "./regularizeService.contract";

type RegularizeSitePasswordApiListItem = RegularizeSitePasswordListItem & {
  password?: string | null;
};

function stripSitePasswordSecret(
  item: RegularizeSitePasswordApiListItem,
): RegularizeSitePasswordListItem {
  const { password: _password, ...safeItem } = item;

  return safeItem;
}

export const regularizeService = {
  async listPasswords(
    filters: RegularizePasswordListFilters,
  ): Promise<RegularizePasswordListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.passwords, {
      params: buildRegularizePasswordListParams(filters),
    });

    return unwrapRegularizeEnvelope<RegularizePasswordListItem[]>(response.data) ?? [];
  },

  async getPassword(id: RegularizeId): Promise<RegularizePasswordDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.password, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizePasswordDetail>(response.data);
  },

  async createPassword(
    payload: CreateRegularizePasswordPayload,
  ): Promise<RegularizePasswordDetail> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.passwords, payload);

    return unwrapRegularizeEnvelope<RegularizePasswordDetail>(response.data);
  },

  async updatePassword(
    payload: UpdateRegularizePasswordPayload,
  ): Promise<RegularizePasswordDetail> {
    const api = setupAPIClient();
    const response = await api.put(REGULARIZE_ENDPOINTS.passwords, payload);

    return unwrapRegularizeEnvelope<RegularizePasswordDetail>(response.data);
  },

  async listSitePasswords(
    filters: RegularizeSitePasswordListFilters,
  ): Promise<RegularizeSitePasswordListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.sitesPass, {
      params: buildRegularizeSitePasswordListParams(filters),
    });
    const rows =
      unwrapRegularizeEnvelope<RegularizeSitePasswordApiListItem[]>(response.data) ?? [];

    return rows.map(stripSitePasswordSecret);
  },

  async getSitePassword(id: RegularizeId): Promise<RegularizeSitePasswordDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.sitesPassDetail, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeSitePasswordDetail>(response.data);
  },

  async createSitePassword(
    payload: CreateRegularizeSitePasswordPayload,
  ): Promise<RegularizeSitePasswordDetail> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.sitesPass, payload);

    return unwrapRegularizeEnvelope<RegularizeSitePasswordDetail>(response.data);
  },

  async updateSitePassword(
    payload: UpdateRegularizeSitePasswordPayload,
  ): Promise<RegularizeSitePasswordDetail> {
    const api = setupAPIClient();
    const response = await api.put(REGULARIZE_ENDPOINTS.sitesPass, payload);

    return unwrapRegularizeEnvelope<RegularizeSitePasswordDetail>(response.data);
  },

  async listClientPfs(
    filters: RegularizeClientPfListFilters,
  ): Promise<RegularizeClientPfListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.pfs, {
      params: buildRegularizeClientPfListParams(filters),
    });

    return unwrapRegularizeEnvelope<RegularizeClientPfListItem[]>(response.data) ?? [];
  },

  async getClientPf(id: RegularizeId): Promise<RegularizeClientPfDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.pf, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeClientPfDetail>(response.data);
  },

  async createClientPf(
    payload: CreateRegularizeClientPfPayload,
  ): Promise<RegularizeClientPfDetail> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.pf, payload);

    return unwrapRegularizeEntity<RegularizeClientPfDetail>(response.data, "create");
  },

  async updateClientPf(
    payload: UpdateRegularizeClientPfPayload,
  ): Promise<RegularizeClientPfDetail> {
    const api = setupAPIClient();
    const response = await api.put(REGULARIZE_ENDPOINTS.pf, payload);

    return unwrapRegularizeEnvelope<RegularizeClientPfDetail>(response.data);
  },

  async listPartners(filters: RegularizePartnerListFilters): Promise<RegularizePartner[]> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.partners, {
      params: buildRegularizePartnerListParams(filters),
    });

    return unwrapRegularizeEnvelope<RegularizePartner[] | undefined>(response.data) ?? [];
  },

  async getPartner(id: RegularizeId): Promise<RegularizePartner> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.partner, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizePartner>(response.data);
  },

  async createPartner(payload: CreateRegularizePartnerPayload): Promise<RegularizePartner> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.partners, payload);

    return unwrapRegularizeEntity<RegularizePartner>(response.data, "create");
  },

  async updatePartner(payload: UpdateRegularizePartnerPayload): Promise<RegularizePartner> {
    const api = setupAPIClient();
    const response = await api.put(REGULARIZE_ENDPOINTS.partners, payload);

    return unwrapRegularizeEnvelope<RegularizePartner>(response.data);
  },

  async listMunicipalTaxes(
    filters: RegularizeMunicipalTaxesListFilters,
  ): Promise<RegularizeMunicipalTaxesClientSummary[]> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.municipalTaxes, {
      params: buildRegularizeMunicipalTaxesListParams(filters),
    });

    return unwrapRegularizeEnvelope<RegularizeMunicipalTaxesClientSummary[]>(response.data) ?? [];
  },

  async getMunicipalTax(id: RegularizeId): Promise<RegularizeMunicipalTaxesDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.municipalTaxesDetail, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeMunicipalTaxesDetail>(response.data);
  },

  async listProcesses(
    filters: RegularizeProcessListFilters,
  ): Promise<RegularizeProcessListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.processes, {
      params: buildRegularizeProcessListParams(filters),
    });

    return unwrapRegularizeEnvelope<RegularizeProcessListItem[]>(response.data) ?? [];
  },

  async getProcess(id: RegularizeId): Promise<RegularizeProcessDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.process, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeProcessDetail>(response.data);
  },

  async listGuidance(filters: RegularizeGuidanceListFilters): Promise<RegularizeGuidance[]> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.guidanceList, {
      params: buildRegularizeGuidanceListParams(filters),
    });

    return unwrapRegularizeEnvelope<RegularizeGuidance[]>(response.data) ?? [];
  },

  async getGuidance(id: RegularizeId): Promise<RegularizeGuidance> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.guidanceDetail, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeGuidance>(response.data);
  },

  async listLicenses(
    filters: RegularizeLicenseListFilters,
  ): Promise<RegularizeLicenseListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.licenses, {
      params: buildRegularizeLicenseListParams(filters),
    });

    return unwrapRegularizeEnvelope<RegularizeLicenseListItem[]>(response.data) ?? [];
  },

  async getLicense(id: RegularizeId): Promise<RegularizeLicenseDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.license, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeLicenseDetail>(response.data);
  },
};
