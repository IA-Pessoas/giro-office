import { ExternalLink, FileUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";

import type { ModuleAccess } from "@modules/auth";

import {
  useDeleteTaskAttachmentMutation,
  useIntegracaoTaskAttachments,
  useUploadTaskAttachmentMutation,
} from "../hooks";
import { integracaoTasksService } from "../services";
import type { IntegracaoTaskDetail } from "../types";
import { PROJECT_COMPACT_BUTTON_CLASSNAME, PROJECT_INPUT_CLASSNAME } from "./projectUi";

interface TaskAttachmentPanelProps {
  task: Pick<
    IntegracaoTaskDetail,
    "id" | "responsible_id" | "responsible2_id" | "responsible3_id"
  >;
  currentUserId: string | undefined;
  accessLevel: ModuleAccess["level"];
  isOwner: boolean;
}

function formatFileSize(size: number) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const data = (error as { response?: { data?: { error?: string; message?: string } } }).response
      ?.data;
    return data?.error ?? data?.message ?? fallback;
  }
  return fallback;
}

export function TaskAttachmentPanel({
  task,
  currentUserId,
  accessLevel,
  isOwner,
}: TaskAttachmentPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const attachmentsQuery = useIntegracaoTaskAttachments(task.id);
  const uploadMutation = useUploadTaskAttachmentMutation();
  const deleteMutation = useDeleteTaskAttachmentMutation();
  const isResponsible = [task.responsible_id, task.responsible2_id, task.responsible3_id].includes(
    currentUserId ?? null,
  );
  const canUpload = isResponsible || accessLevel === "edit" || accessLevel === "admin" || isOwner;
  const canDelete = accessLevel === "admin" || isOwner;

  async function uploadAttachment() {
    if (!file) {
      toast.warning("Selecione um arquivo para anexar.");
      return;
    }
    try {
      await uploadMutation.mutateAsync({ taskId: task.id, file });
      setFile(null);
      setFileInputKey((value) => value + 1);
      toast.success("Arquivo anexado à tarefa.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível anexar o arquivo."));
    }
  }

  async function openAttachment(attachmentId: string) {
    try {
      const url = await integracaoTasksService.getAttachmentAccessUrl(task.id, attachmentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível abrir o arquivo."));
    }
  }

  async function deleteAttachment(attachmentId: string) {
    try {
      await deleteMutation.mutateAsync({ taskId: task.id, attachmentId });
      toast.success("Anexo removido da tarefa.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o anexo."));
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Anexos</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Arquivos privados, até 10 MB, ficam vinculados a esta tarefa.
        </p>
      </div>

      {canUpload ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            key={fileInputKey}
            type="file"
            className={PROJECT_INPUT_CLASSNAME}
            aria-label="Arquivo para anexar à tarefa"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => void uploadAttachment()}
            className={PROJECT_COMPACT_BUTTON_CLASSNAME}
            disabled={uploadMutation.isPending}
          >
            <FileUp className="h-3.5 w-3.5" />
            Anexar
          </button>
        </div>
      ) : null}

      {attachmentsQuery.isLoading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Carregando anexos...</p>
      ) : attachmentsQuery.isError ? (
        <p className="text-xs text-rose-600 dark:text-rose-300">Não foi possível carregar os anexos.</p>
      ) : (attachmentsQuery.data?.length ?? 0) === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum anexo nesta tarefa.</p>
      ) : (
        <ul className="space-y-2">
          {attachmentsQuery.data?.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                {attachment.original_name} · {formatFileSize(attachment.size_bytes)}
              </span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void openAttachment(attachment.id)}
                  className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => void deleteAttachment(attachment.id)}
                    className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
