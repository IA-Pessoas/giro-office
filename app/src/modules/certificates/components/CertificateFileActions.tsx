import { useRef, useState, type ChangeEvent } from "react";
import { isAxiosError } from "axios";
import { Download, LoaderCircle, Trash2, Upload } from "lucide-react";
import { toast } from "react-toastify";

import {
  useDeleteCertificatePfFileMutation,
  useDeleteCertificatePfMutation,
  useDeleteCertificatePjFileMutation,
  useDeleteCertificatePjMutation,
  useDownloadCertificatePfFileMutation,
  useDownloadCertificatePjFileMutation,
  useUploadCertificatePfFileMutation,
  useUploadCertificatePjFileMutation,
} from "@modules/certificates/hooks";
import {
  CERTIFICATE_FILE_ACCEPT,
  isAcceptedCertificateFileName,
} from "@modules/certificates/services";
import type { CertificateDownloadResult, CertificateKind } from "@modules/certificates/types";
import { Dialog } from "@shared/components/ui/Dialog";

import {
  CERTIFICATE_COMPACT_BUTTON_CLASSNAME,
  CERTIFICATE_COMPACT_DANGER_BUTTON_CLASSNAME,
  CERTIFICATE_FILE_ACTION_PANEL_CLASSNAME,
  CERTIFICATE_TABLE_ACTION_BUTTON_CLASSNAME,
  CERTIFICATE_TABLE_ACTION_GROUP_CLASSNAME,
  CERTIFICATE_TABLE_DANGER_ACTION_BUTTON_CLASSNAME,
} from "./certificateWorkspaceUi";

type CertificateFileActionsVariant = "panel" | "inline";

type CertificateFileActionsProps = {
  kind: CertificateKind;
  certificateId: string;
  hasCertificate: boolean;
  canEdit: boolean;
  variant?: CertificateFileActionsVariant;
  onUploadSuccess?: () => void | Promise<void>;
  onDownloadSuccess?: () => void | Promise<void>;
  onDeleteSuccess?: () => void | Promise<void>;
  onDeleteRecordSuccess?: () => void | Promise<void>;
};

type CertificateFileErrorBody = {
  error?: string;
  message?: string;
};

const INVALID_CERTIFICATE_FILE_MESSAGE =
  "Arquivo de certificado deve usar extensao .pfx ou .p12.";

function getCertificateFileErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<CertificateFileErrorBody>(error)) {
    const serverMessage = error.response?.data?.error ?? error.response?.data?.message;
    if (serverMessage) {
      return serverMessage;
    }

    if (error.response?.status === 403) {
      return "Seu perfil não possui permissão para gerenciar arquivos de certificados.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function triggerCertificateDownload(download: CertificateDownloadResult): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const url = window.URL.createObjectURL(download.blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

export function CertificateFileActions({
  kind,
  certificateId,
  hasCertificate,
  canEdit,
  variant = "panel",
  onUploadSuccess,
  onDownloadSuccess,
  onDeleteSuccess,
  onDeleteRecordSuccess,
}: CertificateFileActionsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState("");
  const [isRecordDeleteDialogOpen, setIsRecordDeleteDialogOpen] = useState(false);
  const uploadPjMutation = useUploadCertificatePjFileMutation();
  const uploadPfMutation = useUploadCertificatePfFileMutation();
  const downloadPjMutation = useDownloadCertificatePjFileMutation();
  const downloadPfMutation = useDownloadCertificatePfFileMutation();
  const deletePjMutation = useDeleteCertificatePjFileMutation();
  const deletePfMutation = useDeleteCertificatePfFileMutation();
  const deleteRecordPjMutation = useDeleteCertificatePjMutation();
  const deleteRecordPfMutation = useDeleteCertificatePfMutation();

  const isUploading = kind === "pj" ? uploadPjMutation.isPending : uploadPfMutation.isPending;
  const isDownloading =
    kind === "pj" ? downloadPjMutation.isPending : downloadPfMutation.isPending;
  const isDeleting = kind === "pj" ? deletePjMutation.isPending : deletePfMutation.isPending;
  const isDeletingRecord = kind === "pj" ? deleteRecordPjMutation.isPending : deleteRecordPfMutation.isPending;
  const isBusy = isUploading || isDownloading || isDeleting || isDeletingRecord;
  const inputId = `certificate-${kind}-${certificateId}-${variant}-file`;

  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!isAcceptedCertificateFileName(file.name)) {
      setLocalError(INVALID_CERTIFICATE_FILE_MESSAGE);
      toast.error(INVALID_CERTIFICATE_FILE_MESSAGE);
      resetFileInput();
      return;
    }

    try {
      setLocalError("");
      if (kind === "pj") {
        await uploadPjMutation.mutateAsync({ id: certificateId, file });
      } else {
        await uploadPfMutation.mutateAsync({ id: certificateId, file });
      }
      toast.success("Arquivo de certificado enviado com sucesso.");
      void onUploadSuccess?.();
    } catch (error) {
      const message = getCertificateFileErrorMessage(
        error,
        "Não foi possível enviar o arquivo do certificado.",
      );
      setLocalError(message);
      toast.error(message);
    } finally {
      resetFileInput();
    }
  }

  async function handleDownload() {
    if (!hasCertificate) {
      return;
    }

    try {
      setLocalError("");
      const download =
        kind === "pj"
          ? await downloadPjMutation.mutateAsync({ id: certificateId })
          : await downloadPfMutation.mutateAsync({ id: certificateId });

      triggerCertificateDownload(download);
      toast.success("Download do certificado iniciado.");
      void onDownloadSuccess?.();
    } catch (error) {
      const message = getCertificateFileErrorMessage(
        error,
        "Não foi possível baixar o arquivo do certificado.",
      );
      setLocalError(message);
      toast.error(message);
    }
  }

  async function handleDelete() {
    if (!hasCertificate) {
      return;
    }

    try {
      setLocalError("");
      if (kind === "pj") {
        await deletePjMutation.mutateAsync({ id: certificateId });
      } else {
        await deletePfMutation.mutateAsync({ id: certificateId });
      }
      toast.success("Arquivo de certificado removido com sucesso.");
      void onDeleteSuccess?.();
    } catch (error) {
      const message = getCertificateFileErrorMessage(
        error,
        "Não foi possível remover o arquivo do certificado.",
      );
      setLocalError(message);
      toast.error(message);
    }
  }

  async function handleDeleteRecord() {
    try {
      setLocalError("");
      if (kind === "pj") {
        await deleteRecordPjMutation.mutateAsync({ id: certificateId });
      } else {
        await deleteRecordPfMutation.mutateAsync({ id: certificateId });
      }
      setIsRecordDeleteDialogOpen(false);
      toast.success("Certificado excluído com sucesso.");
      void onDeleteRecordSuccess?.();
    } catch (error) {
      const message = getCertificateFileErrorMessage(error, "Não foi possível excluir o certificado.");
      setLocalError(message);
      toast.error(message);
    }
  }

  if (!canEdit && variant === "inline") {
    return null;
  }

  if (!canEdit) {
    return (
      <div className={CERTIFICATE_FILE_ACTION_PANEL_CLASSNAME}>
        <p className="text-xs text-slate-500 dark:text-slate-400">Arquivo</p>
        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
          Seu perfil não permite gerenciar arquivos de certificados.
        </p>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={CERTIFICATE_TABLE_ACTION_GROUP_CLASSNAME}>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={CERTIFICATE_FILE_ACCEPT}
          className="sr-only"
          onChange={(event) => void handleFileChange(event)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={CERTIFICATE_TABLE_ACTION_BUTTON_CLASSNAME}
          disabled={isBusy}
          title="Enviar arquivo"
        >
          {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => void handleDownload()}
          className={CERTIFICATE_TABLE_ACTION_BUTTON_CLASSNAME}
          disabled={!hasCertificate || isBusy}
          title="Baixar arquivo"
        >
          {isDownloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          className={CERTIFICATE_TABLE_DANGER_ACTION_BUTTON_CLASSNAME}
          disabled={!hasCertificate || isBusy}
          title="Remover arquivo"
        >
          {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className={`${CERTIFICATE_FILE_ACTION_PANEL_CLASSNAME} space-y-3`}>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Arquivo</p>
        <p className="mt-1 font-semibold text-slate-900 dark:text-white">
          {hasCertificate ? "Arquivo de certificado enviado" : "Sem arquivo enviado"}
        </p>
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={CERTIFICATE_FILE_ACCEPT}
        className="sr-only"
        onChange={(event) => void handleFileChange(event)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={CERTIFICATE_COMPACT_BUTTON_CLASSNAME}
          disabled={isBusy}
        >
          {isUploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {isUploading ? "Enviando..." : "Enviar .pfx/.p12"}
        </button>
        <button
          type="button"
          onClick={() => void handleDownload()}
          className={CERTIFICATE_COMPACT_BUTTON_CLASSNAME}
          disabled={!hasCertificate || isBusy}
        >
          {isDownloading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {isDownloading ? "Baixando..." : "Baixar"}
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          className={CERTIFICATE_COMPACT_DANGER_BUTTON_CLASSNAME}
          disabled={!hasCertificate || isBusy}
        >
          {isDeleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {isDeleting ? "Removendo..." : "Remover"}
        </button>
        <button
          type="button"
          onClick={() => setIsRecordDeleteDialogOpen(true)}
          className={CERTIFICATE_COMPACT_DANGER_BUTTON_CLASSNAME}
          disabled={isBusy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir certificado
        </button>
      </div>

      {localError ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{localError}</p>
      ) : null}
      <Dialog
        open={isRecordDeleteDialogOpen}
        onOpenChange={setIsRecordDeleteDialogOpen}
        title="Excluir certificado"
        description="Confirmação de exclusão do certificado"
        footer={
          <>
            <button type="button" onClick={() => setIsRecordDeleteDialogOpen(false)} disabled={isDeletingRecord} className={CERTIFICATE_COMPACT_BUTTON_CLASSNAME}>Cancelar</button>
            <button type="button" onClick={() => void handleDeleteRecord()} disabled={isDeletingRecord} className={CERTIFICATE_COMPACT_DANGER_BUTTON_CLASSNAME}>{isDeletingRecord ? "Excluindo..." : "Excluir certificado"}</button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">Esta ação remove o cadastro e o arquivo associado, quando existir.</p>
      </Dialog>
    </div>
  );
}
