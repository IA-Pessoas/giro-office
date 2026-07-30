import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserCog,
} from "lucide-react";

import { Dialog } from "@shared/components";
import { useAssignableUsers } from "@modules/rh";

import {
  useContabilResponsible,
  useCreateContabilResponsibleMutation,
  useDeleteContabilResponsibleMutation,
  useUpdateContabilResponsibleMutation,
} from "../hooks";
import { getContabilErrorMessage } from "../services";
import { ContabilStateBox } from "./ContabilStateBox";
import {
  buildContabilResponsibleFormValues,
  getContabilSelectLabel,
  mapAssignableUsersToContabilOptions,
  type ContabilResponsibleFormValues,
} from "./contabilPartySection.helpers";

interface ContabilResponsibleSectionProps {
  clientId: string;
  canEdit: boolean;
}

const SECONDARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700";
const PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";
const DANGER_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20";

export function ContabilResponsibleSection({
  clientId,
  canEdit,
}: ContabilResponsibleSectionProps) {
  const responsibleQuery = useContabilResponsible(clientId, { enabled: Boolean(clientId) });
  const createMutation = useCreateContabilResponsibleMutation();
  const updateMutation = useUpdateContabilResponsibleMutation();
  const deleteMutation = useDeleteContabilResponsibleMutation();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ContabilResponsibleFormValues>(
    buildContabilResponsibleFormValues(null),
  );

  const responsible = responsibleQuery.data ?? null;
  const hasResponsibleUserIds = Boolean(
    responsible?.person_responsible_id || responsible?.posted_by_id,
  );
  const assignableUsersQuery = useAssignableUsers({
    enabled: Boolean((canEdit && isEditorOpen) || hasResponsibleUserIds),
  });

  const assignableOptions = useMemo(
    () =>
      mapAssignableUsersToContabilOptions(assignableUsersQuery.data ?? [], [
        formValues.person_responsible_id,
        formValues.posted_by_id,
      ]),
    [assignableUsersQuery.data, formValues.person_responsible_id, formValues.posted_by_id],
  );

  useEffect(() => {
    if (responsible) {
      setFormValues(buildContabilResponsibleFormValues(responsible));
      return;
    }

    if (!isEditorOpen) {
      setFormValues(buildContabilResponsibleFormValues(null));
    }
  }, [responsible, isEditorOpen]);

  function handleStartCreate() {
    setSubmitError(null);
    setIsEditorOpen(true);
    setFormValues(buildContabilResponsibleFormValues(null));
  }

  function handleStartEdit() {
    if (!responsible) {
      return;
    }

    setSubmitError(null);
    setIsEditorOpen(true);
    setFormValues(buildContabilResponsibleFormValues(responsible));
  }

  function handleCloseEditor() {
    setSubmitError(null);
    setIsEditorOpen(false);
    setFormValues(buildContabilResponsibleFormValues(responsible));
  }

  function handleFieldChange<K extends keyof ContabilResponsibleFormValues>(
    field: K,
    value: ContabilResponsibleFormValues[K],
  ) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    try {
      if (responsible) {
        await updateMutation.mutateAsync({
          responsibleId: responsible.id,
          clientId,
          payload: {
            person_responsible_id: formValues.person_responsible_id || null,
            posted_by_id: formValues.posted_by_id || null,
            customer_with_movement: formValues.customer_with_movement,
          },
        });
      } else {
        await createMutation.mutateAsync({
          client_id: clientId,
          person_responsible_id: formValues.person_responsible_id || undefined,
          posted_by_id: formValues.posted_by_id || undefined,
          customer_with_movement: formValues.customer_with_movement,
        });
      }

      setIsEditorOpen(false);
    } catch (error) {
      setSubmitError(getContabilErrorMessage(error));
    }
  }

  async function handleConfirmDelete() {
    if (!responsible) {
      return;
    }

    setSubmitError(null);

    try {
      await deleteMutation.mutateAsync({
        responsibleId: responsible.id,
        clientId,
      });
      setIsDeleteDialogOpen(false);
      setIsEditorOpen(false);
      setFormValues(buildContabilResponsibleFormValues(null));
    } catch (error) {
      setSubmitError(getContabilErrorMessage(error));
      setIsDeleteDialogOpen(false);
    }
  }

  const isSubmitting =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Responsável contábil
                </h2>
              </div>
            </div>
            <p className="max-w-2xl text-sm text-gray-600 dark:text-slate-400">
              Defina os responsáveis e a movimentação do cliente.
            </p>
          </div>

          {responsible && canEdit ? (
            <button
              type="button"
              onClick={handleStartEdit}
              className={SECONDARY_BUTTON_CLASSNAME}
            >
              <Pencil className="h-4 w-4" />
              Editar responsável
            </button>
          ) : null}
        </div>
      </div>

      {!canEdit ? (
        <ContabilStateBox icon={Lock} title="Modo visualização" compact>
          Você pode consultar os dados do responsável contábil, mas não tem permissão para
          alterar este cadastro.
        </ContabilStateBox>
      ) : null}

      {responsibleQuery.isLoading ? (
        <ContabilStateBox icon={Loader2} tone="loading" title="Carregando responsável" compact>
          Buscando os dados cadastrados para este cliente.
        </ContabilStateBox>
      ) : null}

      {!responsibleQuery.isLoading && responsibleQuery.error ? (
        <ContabilStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar o responsável" compact>
          {getContabilErrorMessage(responsibleQuery.error)}
        </ContabilStateBox>
      ) : null}

      {!responsibleQuery.isLoading && !responsibleQuery.error && !responsible ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-4 text-gray-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Responsável não cadastrado
              </p>
              <p className="mt-1 text-sm leading-6">
                Ainda não existe um responsável contábil definido para este cliente.
              </p>
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={handleStartCreate}
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:self-center"
              >
                <Plus className="h-4 w-4" />
                Cadastrar responsável
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!responsibleQuery.isLoading && !responsibleQuery.error && responsible ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-slate-500">
                Responsável principal
              </p>
              <p className="text-sm text-gray-900 dark:text-white">
                {getContabilSelectLabel(responsible.person_responsible_id, assignableOptions)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-slate-500">
                Lançado por
              </p>
              <p className="text-sm text-gray-900 dark:text-white">
                {getContabilSelectLabel(responsible.posted_by_id, assignableOptions)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-slate-500">
                Cliente com movimentação
              </p>
              <p className="text-sm text-gray-900 dark:text-white">
                {responsible.customer_with_movement ? "Sim" : "Não"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseEditor();
          }
        }}
        title={responsible ? "Editar responsável contábil" : "Cadastrar responsável contábil"}
        description="Cadastro do responsável contábil"
        contentClassName="w-[min(92vw,760px)]"
        bodyClassName="space-y-4"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300">
              <span>Responsável principal</span>
              <div className="relative">
                <select
                  value={formValues.person_responsible_id}
                  onChange={(event) =>
                    handleFieldChange("person_responsible_id", event.target.value)
                  }
                  disabled={!canEdit || assignableUsersQuery.isLoading}
                  className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-11 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Não definido</option>
                  {assignableOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
            </label>

            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300">
              <span>Lançado por</span>
              <div className="relative">
                <select
                  value={formValues.posted_by_id}
                  onChange={(event) => handleFieldChange("posted_by_id", event.target.value)}
                  disabled={!canEdit || assignableUsersQuery.isLoading}
                  className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-11 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Não definido</option>
                  {assignableOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            <input
              type="checkbox"
              checked={formValues.customer_with_movement}
              onChange={(event) =>
                handleFieldChange("customer_with_movement", event.target.checked)
              }
              disabled={!canEdit}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
            />
            <span>
              Marque se o cliente possui movimentação e precisa de acompanhamento ativo neste
              fluxo contábil.
            </span>
          </label>

          {assignableUsersQuery.error ? (
            <p className="text-sm text-red-600 dark:text-red-300">
              {getContabilErrorMessage(assignableUsersQuery.error)}
            </p>
          ) : null}

          {submitError ? (
            <p className="text-sm text-red-600 dark:text-red-300">{submitError}</p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!canEdit || isSubmitting}
                className={PRIMARY_BUTTON_CLASSNAME}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {responsible ? "Salvar alterações" : "Cadastrar responsável"}
              </button>

              <button
                type="button"
                onClick={handleCloseEditor}
                disabled={isSubmitting}
                className={SECONDARY_BUTTON_CLASSNAME}
              >
                Cancelar
              </button>
            </div>

            {responsible && canEdit ? (
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={isSubmitting}
                className={DANGER_BUTTON_CLASSNAME}
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </button>
            ) : null}
          </div>
        </form>
      </Dialog>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Remover responsável contábil"
        description="Confirmação de exclusão do responsável contábil"
        contentClassName="w-[min(92vw,520px)]"
        bodyClassName="space-y-3"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(false)}
              className={SECONDARY_BUTTON_CLASSNAME}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className={DANGER_BUTTON_CLASSNAME}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Confirmar remoção
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700 dark:text-slate-300">
          Esta ação remove o responsável contábil atual do cliente. Você poderá cadastrar um
          novo responsável depois, mas este registro será excluído agora.
        </p>
      </Dialog>
    </section>
  );
}
