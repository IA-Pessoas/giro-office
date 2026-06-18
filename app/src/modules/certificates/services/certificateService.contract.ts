import type {
  CertificateFileMetadata,
  CertificateListPage,
  CertificateNotificationListParams,
  CertificatePj,
  CertificatePjListParams,
  CertificatePf,
  CertificatePfListParams,
  CreateCertificatePjBody,
  CreateCertificatePfBody,
  UpdateCertificatePjBody,
  UpdateCertificatePfBody,
  CertificateNotification,
  CertificatePaginationParams,
  CertificateDownloadResult,
} from "../types";

export const CERTIFICATE_ENDPOINTS = {
  pjList: "/certificate/pj/list",
  pjCreate: "/certificate/pj",
  pjDetail: (id: string) => `/certificate/pj/${id}`,
  pjFile: (id: string) => `/certificate/pj/${id}/file`,
  pfList: "/certificate/pf/list",
  pfCreate: "/certificate/pf",
  pfDetail: (id: string) => `/certificate/pf/${id}`,
  pfFile: (id: string) => `/certificate/pf/${id}/file`,
  notifications: "/certificate/notifications",
} as const;

export const DEFAULT_CERTIFICATE_PAGE_SIZE = 50;
export const DEFAULT_CERTIFICATE_PAGE = 1;

function hasFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return false;
  }

  return true;
}

export function buildCertificateListParams<
  T extends object,
>(filters: T): T {
  return (Object.entries(filters as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
    if (hasFilterValue(value)) {
      acc[key] = value;
    }

    return acc;
  },
    {},
  ) as T);
}

export function buildCertificateListPage<T>(
  data: T[],
  params: CertificatePaginationParams = {},
): CertificateListPage<T> {
  const page = params.page ?? DEFAULT_CERTIFICATE_PAGE;
  const pageSize = params.page_size ?? DEFAULT_CERTIFICATE_PAGE_SIZE;

  return {
    data,
    page,
    page_size: pageSize,
    hasMore: data.length === pageSize,
  };
}

export function buildCertificateFileFormData(file: File): FormData {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

export function unwrapCertificateEnvelope<T>(body: unknown): T {
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    "data" in body
  ) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export function parseCertificateFilename(
  contentDispositionHeader: string | undefined,
  fallback: string,
): string {
  if (!contentDispositionHeader) {
    return fallback;
  }

  const rawEncoded = contentDispositionHeader.match(/filename\*=(?:UTF-8''|utf-8'')([^;]+)/i)?.[1];
  if (rawEncoded) {
    const value = rawEncoded.trim();
    try {
      return decodeURIComponent(value.replace(/"/g, ""));
    } catch {
      return value.replace(/"/g, "");
    }
  }

  const rawQuoted = contentDispositionHeader.match(/filename="([^"]+)"/i)?.[1];
  if (rawQuoted) {
    return rawQuoted;
  }

  return contentDispositionHeader.match(/filename=([^;]+)/i)?.[1]?.trim() ?? fallback;
}

export function unwrapCertificateDetail(
  body: unknown,
): CertificatePj | CertificatePf {
  return unwrapCertificateEnvelope(body);
}

export function unwrapCertificateList<T>(
  body: unknown,
  params: CertificatePaginationParams,
): CertificateListPage<T> {
  return buildCertificateListPage(unwrapCertificateEnvelope<T[]>(body), params);
}

export function unwrapCertificateNotifications(
  body: unknown,
  params: CertificateNotificationListParams,
): CertificateListPage<CertificateNotification> {
  return buildCertificateListPage(unwrapCertificateEnvelope<CertificateNotification[]>(body), params);
}

export function unwrapCertificateUploadResult(
  body: unknown,
): CertificateFileMetadata {
  return unwrapCertificateEnvelope(body);
}

export function unwrapCertificateDownload(
  blob: Blob,
  headers: Record<string, string | undefined>,
  fallbackFileName: string,
  fallbackMimeType = "application/octet-stream",
): CertificateDownloadResult {
  return {
    blob,
    filename: parseCertificateFilename(headers["content-disposition"], fallbackFileName),
    mimeType: headers["content-type"] ?? fallbackMimeType,
  };
}

export type CreateCertificatePjPayload = CreateCertificatePjBody;
export type UpdateCertificatePjPayload = UpdateCertificatePjBody;
export type CreateCertificatePfPayload = CreateCertificatePfBody;
export type UpdateCertificatePfPayload = UpdateCertificatePfBody;
