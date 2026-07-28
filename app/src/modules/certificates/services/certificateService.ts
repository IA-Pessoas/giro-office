import { setupAPIClient } from "@shared/services/api";

import type { AxiosResponse } from "axios";

import type {
  CertificateDownloadResult,
  CertificateFileMetadata,
  CertificateListPage,
  CertificateNotification,
  CertificateNotificationListParams,
  CertificatePj,
  CertificatePjListParams,
  CertificatePf,
  CertificatePfListParams,
  CreateCertificatePjBody,
  CreateCertificatePfBody,
  UpdateCertificatePjBody,
  UpdateCertificatePfBody,
} from "../types";
import {
  buildCertificateFileFormData,
  buildCertificateListPage,
  buildCertificateListParams,
  CERTIFICATE_ENDPOINTS,
  unwrapCertificateDownload,
  unwrapCertificateEnvelope,
  unwrapCertificateList,
} from "./certificateService.contract";

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export const certificateService = {
  async listPj(params: CertificatePjListParams = {}): Promise<
    CertificateListPage<CertificatePj>
  > {
    const api = setupAPIClient();
    const response = await api.get(CERTIFICATE_ENDPOINTS.pjList, {
      params: buildCertificateListParams(params),
    });

    return unwrapCertificateList<CertificatePj>(response.data, params);
  },

  async detailPj(id: string): Promise<CertificatePj> {
    const api = setupAPIClient();
    const response = await api.get(CERTIFICATE_ENDPOINTS.pjDetail(id));

    return unwrapCertificateEnvelope<CertificatePj>(response.data);
  },

  async createPj(payload: CreateCertificatePjBody): Promise<CertificatePj> {
    const api = setupAPIClient();
    const response = await api.post(CERTIFICATE_ENDPOINTS.pjCreate, payload);

    return unwrapCertificateEnvelope<CertificatePj>(response.data);
  },

  async updatePj(id: string, payload: UpdateCertificatePjBody): Promise<CertificatePj> {
    const api = setupAPIClient();
    const response = await api.patch(CERTIFICATE_ENDPOINTS.pjDetail(id), payload);

    return unwrapCertificateEnvelope<CertificatePj>(response.data);
  },

  async uploadPjFile(id: string, file: File): Promise<CertificateFileMetadata> {
    const api = setupAPIClient();
    const response = await api.post(
      CERTIFICATE_ENDPOINTS.pjFile(id),
      buildCertificateFileFormData(file),
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );

    return unwrapCertificateEnvelope<CertificateFileMetadata>(response.data);
  },

  async downloadPjFile(id: string): Promise<CertificateDownloadResult> {
    const api = setupAPIClient();
    const response: AxiosResponse<Blob> = await api.get(CERTIFICATE_ENDPOINTS.pjFile(id), {
      responseType: "blob",
    });
    const headers = response.headers as unknown as Record<
      string,
      string | string[] | undefined
    >;
    const fallbackFilename = `certificate-pj-${id}.pfx`;
    const contentDisposition = getHeaderValue(headers, "content-disposition");
    const contentType = getHeaderValue(headers, "content-type");

    return unwrapCertificateDownload(
      response.data,
      {
        "content-disposition": contentDisposition,
        "content-type": contentType,
      },
      fallbackFilename,
      contentType ?? "application/octet-stream",
    );
  },

  async deletePjFile(id: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(CERTIFICATE_ENDPOINTS.pjFile(id));
  },

  async deletePj(id: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(CERTIFICATE_ENDPOINTS.pjDetail(id));
  },

  async listPf(params: CertificatePfListParams = {}): Promise<
    CertificateListPage<CertificatePf>
  > {
    const api = setupAPIClient();
    const response = await api.get(CERTIFICATE_ENDPOINTS.pfList, {
      params: buildCertificateListParams(params),
    });

    return unwrapCertificateList<CertificatePf>(response.data, params);
  },

  async detailPf(id: string): Promise<CertificatePf> {
    const api = setupAPIClient();
    const response = await api.get(CERTIFICATE_ENDPOINTS.pfDetail(id));

    return unwrapCertificateEnvelope<CertificatePf>(response.data);
  },

  async createPf(payload: CreateCertificatePfBody): Promise<CertificatePf> {
    const api = setupAPIClient();
    const response = await api.post(CERTIFICATE_ENDPOINTS.pfCreate, payload);

    return unwrapCertificateEnvelope<CertificatePf>(response.data);
  },

  async updatePf(id: string, payload: UpdateCertificatePfBody): Promise<CertificatePf> {
    const api = setupAPIClient();
    const response = await api.patch(CERTIFICATE_ENDPOINTS.pfDetail(id), payload);

    return unwrapCertificateEnvelope<CertificatePf>(response.data);
  },

  async uploadPfFile(id: string, file: File): Promise<CertificateFileMetadata> {
    const api = setupAPIClient();
    const response = await api.post(
      CERTIFICATE_ENDPOINTS.pfFile(id),
      buildCertificateFileFormData(file),
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );

    return unwrapCertificateEnvelope<CertificateFileMetadata>(response.data);
  },

  async downloadPfFile(id: string): Promise<CertificateDownloadResult> {
    const api = setupAPIClient();
    const response: AxiosResponse<Blob> = await api.get(CERTIFICATE_ENDPOINTS.pfFile(id), {
      responseType: "blob",
    });
    const headers = response.headers as unknown as Record<
      string,
      string | string[] | undefined
    >;
    const fallbackFilename = `certificate-pf-${id}.pfx`;
    const contentDisposition = getHeaderValue(headers, "content-disposition");
    const contentType = getHeaderValue(headers, "content-type");

    return unwrapCertificateDownload(
      response.data,
      {
        "content-disposition": contentDisposition,
        "content-type": contentType,
      },
      fallbackFilename,
      contentType ?? "application/octet-stream",
    );
  },

  async deletePfFile(id: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(CERTIFICATE_ENDPOINTS.pfFile(id));
  },

  async deletePf(id: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(CERTIFICATE_ENDPOINTS.pfDetail(id));
  },

  async listNotifications(
    params: CertificateNotificationListParams = {},
  ): Promise<CertificateListPage<CertificateNotification>> {
    const api = setupAPIClient();
    const response = await api.get(CERTIFICATE_ENDPOINTS.notifications, {
      params: buildCertificateListParams(params),
    });

    const items = unwrapCertificateEnvelope<CertificateNotification[]>(response.data);
    return buildCertificateListPage(items, params);
  },
};
