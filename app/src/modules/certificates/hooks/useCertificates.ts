import {
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { certificateService } from "../services";
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
  certificatePfDetailQueryKey,
  certificateNotificationsQueryKey,
  certificatePfListQueryKey,
  certificatePjDetailQueryKey,
  certificatePjListQueryKey,
  CERTIFICATE_QUERY_KEY,
} from "./queryKeys";

export const CERTIFICATE_PJ_LIST_DEFAULTS: CertificatePjListParams = {
  page: 1,
  page_size: 50,
};

export function useCertificatePjList(
  params: CertificatePjListParams = CERTIFICATE_PJ_LIST_DEFAULTS,
): UseQueryResult<CertificateListPage<CertificatePj>, Error> {
  return useFetch(
    certificatePjListQueryKey(params),
    () => certificateService.listPj(params),
    {
      placeholderData: (previousData) => previousData,
      refetchOnWindowFocus: false,
    },
  );
}

export function useCertificatePfList(
  params: CertificatePfListParams = CERTIFICATE_PJ_LIST_DEFAULTS,
): UseQueryResult<CertificateListPage<CertificatePf>, Error> {
  return useFetch(
    certificatePfListQueryKey(params),
    () => certificateService.listPf(params),
    {
      placeholderData: (previousData) => previousData,
      refetchOnWindowFocus: false,
    },
  );
}

export function useCertificateNotificationsList(
  params: CertificateNotificationListParams,
): UseQueryResult<CertificateListPage<CertificateNotification>, Error> {
  return useFetch(certificateNotificationsQueryKey(params), () => certificateService.listNotifications(params), {
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });
}

export function useCertificatePjDetail(
  id: string | undefined,
): UseQueryResult<CertificatePj, Error> {
  return useFetch(
    certificatePjDetailQueryKey(id ?? "missing"),
    () => certificateService.detailPj(id ?? ""),
    {
      enabled: Boolean(id),
      refetchOnWindowFocus: false,
    },
  );
}

export function useCertificatePfDetail(
  id: string | undefined,
): UseQueryResult<CertificatePf, Error> {
  return useFetch(
    certificatePfDetailQueryKey(id ?? "missing"),
    () => certificateService.detailPf(id ?? ""),
    {
      enabled: Boolean(id),
      refetchOnWindowFocus: false,
    },
  );
}

export function useCreateCertificatePjMutation(): UseMutationResult<
  CertificatePj,
  Error,
  CreateCertificatePjBody
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => certificateService.createPj(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUERY_KEY });
    },
  });
}

export function useUpdateCertificatePjMutation(
  id: string,
): UseMutationResult<CertificatePj, Error, UpdateCertificatePjBody> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => certificateService.updatePj(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: certificatePjDetailQueryKey(id) });
    },
  });
}

export function useUploadCertificatePjFileMutation(): UseMutationResult<
  CertificateFileMetadata,
  Error,
  { id: string; file: File }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }) => certificateService.uploadPjFile(id, file),
    onSuccess: async (_, { id }) => {
      await queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: certificatePjDetailQueryKey(id) });
    },
  });
}

export function useDownloadCertificatePjFileMutation(): UseMutationResult<
  CertificateDownloadResult,
  Error,
  { id: string }
> {
  return useMutation({
    mutationFn: ({ id }) => certificateService.downloadPjFile(id),
  });
}

export function useDeleteCertificatePjFileMutation(): UseMutationResult<
  void,
  Error,
  { id: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }) => certificateService.deletePjFile(id),
    onSuccess: async (_, { id }) => {
      await queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: certificatePjDetailQueryKey(id) });
    },
  });
}

export function useCreateCertificatePfMutation(): UseMutationResult<
  CertificatePf,
  Error,
  CreateCertificatePfBody
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => certificateService.createPf(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUERY_KEY });
    },
  });
}

export function useUpdateCertificatePfMutation(
  id: string,
): UseMutationResult<CertificatePf, Error, UpdateCertificatePfBody> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => certificateService.updatePf(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: certificatePfDetailQueryKey(id) });
    },
  });
}

export function useUploadCertificatePfFileMutation(): UseMutationResult<
  CertificateFileMetadata,
  Error,
  { id: string; file: File }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }) => certificateService.uploadPfFile(id, file),
    onSuccess: async (_, { id }) => {
      await queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: certificatePfDetailQueryKey(id) });
    },
  });
}

export function useDownloadCertificatePfFileMutation(): UseMutationResult<
  CertificateDownloadResult,
  Error,
  { id: string }
> {
  return useMutation({
    mutationFn: ({ id }) => certificateService.downloadPfFile(id),
  });
}

export function useDeleteCertificatePfFileMutation(): UseMutationResult<
  void,
  Error,
  { id: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }) => certificateService.deletePfFile(id),
    onSuccess: async (_, { id }) => {
      await queryClient.invalidateQueries({ queryKey: CERTIFICATE_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: certificatePfDetailQueryKey(id) });
    },
  });
}
