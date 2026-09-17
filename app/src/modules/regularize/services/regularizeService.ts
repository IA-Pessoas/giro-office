import { setupAPIClient } from "@shared/services/api";

import type {
  AddRegularizeGuidanceActivityPayload,
  AddRegularizeGuidancePartnerPayload,
  CreateRegularizeClientPfPayload,
  CreateRegularizeGuidancePayload,
  CreateRegularizeLicensePayload,
  CreateRegularizeMunicipalTaxPayload,
  CreateRegularizePartnerPayload,
  CreateRegularizePasswordPayload,
  CreateRegularizeProcessPayload,
  CreateRegularizeSitePasswordPayload,
  RemoveRegularizeGuidanceActivityPayload,
  RemoveRegularizeGuidancePartnerPayload,
  LegacyGuidanceDraft,
  RegularizeClientPfDetail,
  RegularizeClientPfListFilters,
  RegularizeClientPfListItem,
  RegularizeDashboard,
  RegularizeGuidance,
  RegularizeGuidanceListFilters,
  RegularizeId,
  RegularizeLicenseDetail,
  RegularizeLicenseListFilters,
  RegularizeLicenseListItem,
  RegularizeMunicipalTaxesDetail,
  RegularizeMunicipalTaxesListFilters,
  RegularizeMunicipalTaxesPage,
  RegularizePartner,
  RegularizePartnerListFilters,
  RegularizeProcessActionPayload,
  RegularizeProcessActionResult,
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
  UpdateRegularizeGuidancePayload,
  UpdateRegularizeLicensePayload,
  UpdateRegularizeMunicipalTaxPayload,
  UpdateRegularizePartnerPayload,
  UpdateRegularizePasswordPayload,
  UpdateRegularizeProcessPayload,
  UpdateRegularizeSitePasswordPayload,
} from "../types";
import type { PaginatedResult } from "@shared/pagination/pagination";
import {
  buildRegularizeClientPfListParams,
  buildRegularizeDashboardParams,
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
  unwrapRegularizePage,
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

function isLegacyGuidanceDraft(
  payload: CreateRegularizeGuidancePayload,
): payload is LegacyGuidanceDraft {
  return !("checklist" in payload);
}

export const regularizeService = {
  async getDashboard(year: number): Promise<RegularizeDashboard> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.dashboard, {
      params: buildRegularizeDashboardParams(year),
    });

    return unwrapRegularizeEnvelope<RegularizeDashboard>(response.data);
  },

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

  async listSitePasswordsPage(
    filters: RegularizeSitePasswordListFilters & { page: number; limit: number },
  ): Promise<PaginatedResult<RegularizeSitePasswordListItem>> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.sitesPass, {
      params: buildRegularizeSitePasswordListParams(filters),
    });
    const page = unwrapRegularizePage<RegularizeSitePasswordApiListItem>(
      response.data,
      filters,
    );

    return { ...page, data: page.data.map(stripSitePasswordSecret) };
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

  async listClientPfsPage(
    filters: RegularizeClientPfListFilters & { page: number; limit: number },
  ): Promise<PaginatedResult<RegularizeClientPfListItem>> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.pfs, {
      params: buildRegularizeClientPfListParams(filters),
    });

    return unwrapRegularizePage<RegularizeClientPfListItem>(response.data, filters);
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

  async deletePartner(id: RegularizeId): Promise<{ ok: true }> {
    const api = setupAPIClient();
    const response = await api.delete(REGULARIZE_ENDPOINTS.deletePartner(id));

    return unwrapRegularizeEnvelope<{ ok: true }>(response.data);
  },

  async listMunicipalTaxes(
    filters: RegularizeMunicipalTaxesListFilters,
  ): Promise<RegularizeMunicipalTaxesPage> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.municipalTaxes, {
      params: buildRegularizeMunicipalTaxesListParams(filters),
    });

    return unwrapRegularizeEnvelope<RegularizeMunicipalTaxesPage>(response.data);
  },

  async getMunicipalTax(id: RegularizeId): Promise<RegularizeMunicipalTaxesDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.municipalTaxesDetail, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeMunicipalTaxesDetail>(response.data);
  },

  async createMunicipalTax(
    payload: CreateRegularizeMunicipalTaxPayload,
  ): Promise<RegularizeMunicipalTaxesDetail> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.municipalTaxes, payload);

    return unwrapRegularizeEnvelope<RegularizeMunicipalTaxesDetail>(response.data);
  },

  async updateMunicipalTax(
    payload: UpdateRegularizeMunicipalTaxPayload,
  ): Promise<RegularizeMunicipalTaxesDetail> {
    const api = setupAPIClient();
    const response = await api.put(REGULARIZE_ENDPOINTS.municipalTaxes, payload);

    return unwrapRegularizeEnvelope<RegularizeMunicipalTaxesDetail>(response.data);
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

  async listProcessesPage(
    filters: RegularizeProcessListFilters & { page: number; limit: number },
  ): Promise<PaginatedResult<RegularizeProcessListItem>> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.processes, {
      params: buildRegularizeProcessListParams(filters),
    });

    return unwrapRegularizePage<RegularizeProcessListItem>(response.data, filters);
  },

  async getProcess(id: RegularizeId): Promise<RegularizeProcessDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.process, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeProcessDetail>(response.data);
  },

  async createProcess(
    payload: CreateRegularizeProcessPayload,
  ): Promise<RegularizeProcessDetail> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.process, payload);

    return unwrapRegularizeEntity<RegularizeProcessDetail>(response.data, "create");
  },

  async updateProcess(
    payload: UpdateRegularizeProcessPayload,
  ): Promise<RegularizeProcessDetail> {
    const api = setupAPIClient();
    const response = await api.put(REGULARIZE_ENDPOINTS.process, payload);

    return unwrapRegularizeEnvelope<RegularizeProcessDetail>(response.data);
  },

  async sendProcessToFiscal(
    payload: RegularizeProcessActionPayload,
  ): Promise<RegularizeProcessActionResult> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.sendToFiscal, payload);

    return unwrapRegularizeEnvelope<RegularizeProcessActionResult>(response.data);
  },

  async returnProcessFromFiscal(
    payload: RegularizeProcessActionPayload,
  ): Promise<RegularizeProcessActionResult> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.returnFromFiscal, payload);

    return unwrapRegularizeEnvelope<RegularizeProcessActionResult>(response.data);
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

  async createGuidance(payload: CreateRegularizeGuidancePayload): Promise<RegularizeGuidance> {
    if (isLegacyGuidanceDraft(payload)) {
      throw new Error(
        "Rascunho legado de orientação não pode ser enviado; a Task 7 deve migrar este caller para checklist.",
      );
    }

    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.guidance, payload);

    return unwrapRegularizeEnvelope<RegularizeGuidance>(response.data);
  },

  async updateGuidance(payload: UpdateRegularizeGuidancePayload): Promise<RegularizeGuidance> {
    const api = setupAPIClient();
    const response = await api.put(REGULARIZE_ENDPOINTS.guidance, payload);

    return unwrapRegularizeEnvelope<RegularizeGuidance>(response.data);
  },

  async addGuidanceActivity(
    payload: AddRegularizeGuidanceActivityPayload,
  ): Promise<RegularizeGuidance> {
    const api = setupAPIClient();
    const { process_id: _processId, ...body } = payload;
    const response = await api.post(REGULARIZE_ENDPOINTS.guidanceActivityAdd, body);

    return unwrapRegularizeEnvelope<RegularizeGuidance>(response.data);
  },

  async removeGuidanceActivity(
    payload: RemoveRegularizeGuidanceActivityPayload,
  ): Promise<RegularizeGuidance> {
    const api = setupAPIClient();
    const { process_id: _processId, ...body } = payload;
    const response = await api.post(REGULARIZE_ENDPOINTS.guidanceActivityRemove, body);

    return unwrapRegularizeEnvelope<RegularizeGuidance>(response.data);
  },

  async addGuidancePartner(
    payload: AddRegularizeGuidancePartnerPayload,
  ): Promise<RegularizeGuidance> {
    const api = setupAPIClient();
    const { process_id: _processId, ...body } = payload;
    const response = await api.post(REGULARIZE_ENDPOINTS.guidancePartnerAdd, body);

    return unwrapRegularizeEnvelope<RegularizeGuidance>(response.data);
  },

  async removeGuidancePartner(
    payload: RemoveRegularizeGuidancePartnerPayload,
  ): Promise<RegularizeGuidance> {
    const api = setupAPIClient();
    const { process_id: _processId, ...body } = payload;
    const response = await api.post(REGULARIZE_ENDPOINTS.guidancePartnerRemove, body);

    return unwrapRegularizeEnvelope<RegularizeGuidance>(response.data);
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

  async listLicensesPage(
    filters: RegularizeLicenseListFilters & { page: number; limit: number },
  ): Promise<PaginatedResult<RegularizeLicenseListItem>> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.licenses, {
      params: buildRegularizeLicenseListParams(filters),
    });

    return unwrapRegularizePage<RegularizeLicenseListItem>(response.data, filters);
  },

  async getLicense(id: RegularizeId): Promise<RegularizeLicenseDetail> {
    const api = setupAPIClient();
    const response = await api.get(REGULARIZE_ENDPOINTS.license, {
      params: buildRegularizeIdParams(id),
    });

    return unwrapRegularizeEntity<RegularizeLicenseDetail>(response.data);
  },

  async createLicense(payload: CreateRegularizeLicensePayload): Promise<RegularizeLicenseDetail> {
    const api = setupAPIClient();
    const response = await api.post(REGULARIZE_ENDPOINTS.license, payload);

    return unwrapRegularizeEnvelope<RegularizeLicenseDetail>(response.data);
  },

  async updateLicense(payload: UpdateRegularizeLicensePayload): Promise<RegularizeLicenseDetail> {
    const api = setupAPIClient();
    const response = await api.put(REGULARIZE_ENDPOINTS.license, payload);

    return unwrapRegularizeEnvelope<RegularizeLicenseDetail>(response.data);
  },
};
