import { Dialog } from "@shared/components";

import { useRhRequest } from "../hooks/useRhRequests";
import {
  formatRhDateTime,
  getRhRequestStatusClassName,
  getRhRequestStatusLabel,
  getRhRequestUrgencyClassName,
  getRhRequestUrgencyLabel,
} from "../utils/rhRequestUi";
import { RhRequestMessagesTimeline } from "./RhRequestMessagesTimeline";

interface RhRequestDetailModalProps {
  open: boolean;
  requestId: string | null;
  getCategoryLabel: (categoryId: string) => string;
  getAssignedUserLabel: (userId: string) => string;
  isDeleting: boolean;
  onClose: () => void;
  onEdit: (requestId: string) => void;
  onDelete: (requestId: string) => void;
}

export function RhRequestDetailModal({
  open,
  requestId,
  getCategoryLabel,
  getAssignedUserLabel,
  isDeleting,
  onClose,
  onEdit,
  onDelete,
}: RhRequestDetailModalProps) {
  const requestQuery = useRhRequest(requestId ?? undefined);
  const request = requestQuery.data;
  const canManageRequest = Boolean(request);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Detalhes da solicitação"
      description="Informações completas da solicitação de RH"
      contentClassName="w-[min(92vw,920px)]"
      bodyClassName="max-h-[78vh] space-y-5 overflow-y-auto"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={!canManageRequest}
            onClick={() => {
              if (request) {
                onEdit(request.id);
              }
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={!canManageRequest || isDeleting}
            onClick={() => {
              if (request) {
                onDelete(request.id);
              }
            }}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
          >
            {isDeleting ? "Excluindo..." : "Excluir"}
          </button>
        </>
      }
    >
      {requestQuery.isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-300">
          Carregando detalhes da solicitação...
        </div>
      ) : null}

      {!requestQuery.isLoading && requestQuery.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar os detalhes desta solicitação.
        </div>
      ) : null}

      {!requestQuery.isLoading && !requestQuery.error && !request ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-300">
          Solicitação não encontrada.
        </div>
      ) : null}

      {!requestQuery.isLoading && !requestQuery.error && request ? (
        <>
          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {request.title}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Criado em {formatRhDateTime(request.created_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${getRhRequestStatusClassName(
                    request.status,
                  )}`}
                >
                  {getRhRequestStatusLabel(request.status)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${getRhRequestUrgencyClassName(
                    request.urgency,
                  )}`}
                >
                  {getRhRequestUrgencyLabel(request.urgency)}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Categoria
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {getCategoryLabel(request.category_id)}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Responsável
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {getAssignedUserLabel(request.assigned_to_user_id)}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Atualizado em
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {formatRhDateTime(request.updated_at)}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Descrição
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                {request.description}
              </p>
            </div>
          </section>

          <RhRequestMessagesTimeline requestId={request.id} />
        </>
      ) : null}
    </Dialog>
  );
}
