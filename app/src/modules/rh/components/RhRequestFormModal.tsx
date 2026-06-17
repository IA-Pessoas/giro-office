import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";

import { useCreateRhRequestMutation, useUpdateRhRequestMutation } from "../hooks/useRhRequests";
import type {
  AssignableUser,
  CreateRhRequestPayload,
  RhCategory,
  RhRequest,
  RhRequestStatus,
  RhRequestUrgency,
} from "../types";
import { formatRhCategoryLabel, RH_REQUEST_STATUS_META } from "../utils/rhRequestUi";

interface RhRequestFormModalProps {
  open: boolean;
  categories: RhCategory[];
  assignableUsers: AssignableUser[];
  canManageRequests: boolean;
  assignableUsersUnavailableMessage?: string | null;
  request: RhRequest | null;
  onClose: () => void;
}

interface RhRequestFormState {
  title: string;
  description: string;
  category_id: string;
  assigned_to_user_id: string;
  urgency: RhRequestUrgency;
  status: RhRequestStatus;
}

const DEFAULT_FORM_STATE: RhRequestFormState = {
  title: "",
  description: "",
  category_id: "",
  assigned_to_user_id: "",
  urgency: "Medium",
  status: "New",
};

function buildFormState(request: RhRequest | null): RhRequestFormState {
  if (!request) {
    return DEFAULT_FORM_STATE;
  }

  return {
    title: request.title,
    description: request.description,
    category_id: request.category_id,
    assigned_to_user_id: request.assigned_to_user_id,
    urgency: request.urgency,
    status: request.status,
  };
}

export function RhRequestFormModal({
  open,
  categories,
  assignableUsers,
  canManageRequests,
  assignableUsersUnavailableMessage,
  request,
  onClose,
}: RhRequestFormModalProps) {
  const createMutation = useCreateRhRequestMutation();
  const updateMutation = useUpdateRhRequestMutation();
  const [formState, setFormState] = useState<RhRequestFormState>(buildFormState(request));

  const isEditing = Boolean(request);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    setFormState(buildFormState(request));
  }, [request, open]);

  function handleChange<K extends keyof RhRequestFormState>(
    key: K,
    value: RhRequestFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleClose() {
    setFormState(buildFormState(request));
    onClose();
  }

  async function handleSubmit() {
    const requiresAssignee = canManageRequests;

    if (
      !formState.title.trim() ||
      !formState.description.trim() ||
      !formState.category_id ||
      (requiresAssignee && !formState.assigned_to_user_id)
    ) {
      toast.warn("Preencha os campos obrigatórios.");
      return;
    }

    try {
      if (request) {
        await updateMutation.mutateAsync({
          id: request.id,
          title: formState.title.trim(),
          description: formState.description.trim(),
          category_id: formState.category_id,
          assigned_to_user_id: formState.assigned_to_user_id,
          urgency: formState.urgency,
          status: formState.status,
        });
        toast.success("Solicitação atualizada com sucesso.");
      } else {
        const createPayload: CreateRhRequestPayload = {
          title: formState.title.trim(),
          description: formState.description.trim(),
          category_id: formState.category_id,
          urgency: formState.urgency,
        };

        await createMutation.mutateAsync(
          canManageRequests && formState.assigned_to_user_id
            ? { ...createPayload, assigned_to_user_id: formState.assigned_to_user_id }
            : createPayload,
        );
        toast.success("Solicitação criada com sucesso.");
      }

      setFormState(DEFAULT_FORM_STATE);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar a solicitação.";
      toast.error(message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
      title={isEditing ? "Editar solicitação" : "Nova solicitação"}
      description="Formulário de solicitação de RH"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Salvando..."
              : isEditing
                ? "Salvar alterações"
                : "Criar solicitação"}
          </button>
        </>
      }
      contentClassName="w-[min(92vw,720px)]"
      bodyClassName="space-y-4"
    >
      {canManageRequests && assignableUsersUnavailableMessage ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          {assignableUsersUnavailableMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
          <span>Título</span>
          <input
            value={formState.title}
            onChange={(event) => handleChange("title", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Ex.: Solicitação de férias"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Categoria</span>
          <div className="relative">
            <select
              value={formState.category_id}
              onChange={(event) => handleChange("category_id", event.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Selecione</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {formatRhCategoryLabel(category.name)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        {canManageRequests ? (
          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span>Responsável</span>
            <div className="relative">
              <select
                value={formState.assigned_to_user_id}
                onChange={(event) => handleChange("assigned_to_user_id", event.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">
                  {assignableUsers.length === 0
                    ? "Nenhum responsável de RH disponível"
                    : "Selecione"}
                </option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </label>
        ) : null}

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
          <span>Urgência</span>
          <div className="relative">
            <select
              value={formState.urgency}
              onChange={(event) =>
                handleChange("urgency", event.target.value as RhRequestUrgency)
              }
              className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="Low">Baixa</option>
              <option value="Medium">Média</option>
              <option value="High">Alta</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
          <span>Descrição</span>
          <textarea
            value={formState.description}
            onChange={(event) => handleChange("description", event.target.value)}
            rows={5}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Descreva o contexto da solicitação"
          />
        </label>

        {isEditing ? (
          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
            <span>Status</span>
            <div className="relative">
              <select
                value={formState.status}
                onChange={(event) =>
                  handleChange("status", event.target.value as RhRequestStatus)
                }
                className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                {Object.entries(RH_REQUEST_STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </label>
        ) : null}
      </div>
    </Dialog>
  );
}
