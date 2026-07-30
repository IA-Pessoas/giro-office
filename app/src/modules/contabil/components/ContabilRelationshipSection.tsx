import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  Waypoints,
} from "lucide-react";

import { Dialog } from "@shared/components";

import {
  useContabilRelationship,
  useCreateContabilRelationshipMutation,
  useDeleteContabilRelationshipMutation,
  useUpdateContabilRelationshipMutation,
} from "../hooks";
import { getContabilErrorMessage } from "../services";
import { ContabilStateBox } from "./ContabilStateBox";
import {
  CONTABIL_RELATIONSHIP_BOOLEAN_FIELDS,
  CONTABIL_RELATIONSHIP_FIELDS,
  CONTABIL_RELATIONSHIP_TEXTAREA_FIELDS,
  CONTABIL_RELATIONSHIP_TEXT_FIELDS,
} from "./contabilRelationshipFields";
import {
  buildContabilRelationshipFormValues,
  isContabilTextValueFilled,
  type ContabilRelationshipFormValues,
} from "./contabilPartySection.helpers";

interface ContabilRelationshipSectionProps {
  clientId: string;
  canEdit: boolean;
}

const SECONDARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700";
const PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";
const DANGER_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20";

export function ContabilRelationshipSection({
  clientId,
  canEdit,
}: ContabilRelationshipSectionProps) {
  const relationshipQuery = useContabilRelationship(clientId, { enabled: Boolean(clientId) });
  const createMutation = useCreateContabilRelationshipMutation();
  const updateMutation = useUpdateContabilRelationshipMutation();
  const deleteMutation = useDeleteContabilRelationshipMutation();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ContabilRelationshipFormValues>(
    buildContabilRelationshipFormValues(null),
  );

  const relationship = relationshipQuery.data ?? null;

  useEffect(() => {
    if (relationship) {
      setFormValues(buildContabilRelationshipFormValues(relationship));
      return;
    }

    if (!isEditorOpen) {
      setFormValues(buildContabilRelationshipFormValues(null));
    }
  }, [relationship, isEditorOpen]);

  function handleStartCreate() {
    setSubmitError(null);
    setIsEditorOpen(true);
    setFormValues(buildContabilRelationshipFormValues(null));
  }

  function handleStartEdit() {
    if (!relationship) {
      return;
    }

    setSubmitError(null);
    setIsEditorOpen(true);
    setFormValues(buildContabilRelationshipFormValues(relationship));
  }

  function handleCloseEditor() {
    setSubmitError(null);
    setIsEditorOpen(false);
    setFormValues(buildContabilRelationshipFormValues(relationship));
  }

  function handleFieldChange<K extends keyof ContabilRelationshipFormValues>(
    field: K,
    value: ContabilRelationshipFormValues[K],
  ) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function validateRelationshipForm() {
    if (!isContabilTextValueFilled(formValues.chart_accounts)) {
      return "Informe o plano de contas.";
    }

    if (!isContabilTextValueFilled(formValues.tool)) {
      return "Informe a ferramenta utilizada.";
    }

    if (!isContabilTextValueFilled(formValues.system)) {
      return "Informe o sistema utilizado.";
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const validationError = validateRelationshipForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    try {
      if (relationship) {
        await updateMutation.mutateAsync({
          relationshipId: relationship.id,
          clientId,
          payload: {
            bidding: formValues.bidding,
            chart_accounts: formValues.chart_accounts.trim(),
            tool: formValues.tool.trim(),
            system: formValues.system.trim(),
            note: formValues.note,
          },
        });
      } else {
        await createMutation.mutateAsync({
          client_id: clientId,
          bidding: formValues.bidding,
          chart_accounts: formValues.chart_accounts.trim(),
          tool: formValues.tool.trim(),
          system: formValues.system.trim(),
          note: formValues.note,
        });
      }

      setIsEditorOpen(false);
    } catch (error) {
      setSubmitError(getContabilErrorMessage(error));
    }
  }

  async function handleConfirmDelete() {
    if (!relationship) {
      return;
    }

    setSubmitError(null);

    try {
      await deleteMutation.mutateAsync({
        relationshipId: relationship.id,
        clientId,
      });
      setIsDeleteDialogOpen(false);
      setIsEditorOpen(false);
      setFormValues(buildContabilRelationshipFormValues(null));
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
                <Waypoints className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Relacionamento contábil
                </h2>
              </div>
            </div>
            <p className="max-w-2xl text-sm text-gray-600 dark:text-slate-400">
              Registre sistema, ferramenta e contexto operacional do cliente.
            </p>
          </div>

          {relationship && canEdit ? (
            <button
              type="button"
              onClick={handleStartEdit}
              className={SECONDARY_BUTTON_CLASSNAME}
            >
              <Pencil className="h-4 w-4" />
              Editar relacionamento
            </button>
          ) : null}
        </div>
      </div>

      {!canEdit ? (
        <ContabilStateBox icon={Lock} title="Modo visualização" compact>
          Você pode consultar os dados do relacionamento contábil, mas não tem permissão para
          alterar este cadastro.
        </ContabilStateBox>
      ) : null}

      {relationshipQuery.isLoading ? (
        <ContabilStateBox icon={Loader2} tone="loading" title="Carregando relacionamento" compact>
          Buscando os dados cadastrados para este cliente.
        </ContabilStateBox>
      ) : null}

      {!relationshipQuery.isLoading && relationshipQuery.error ? (
        <ContabilStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar o relacionamento" compact>
          {getContabilErrorMessage(relationshipQuery.error)}
        </ContabilStateBox>
      ) : null}

      {!relationshipQuery.isLoading && !relationshipQuery.error && !relationship ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-4 text-gray-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Relacionamento não cadastrado
              </p>
              <p className="mt-1 text-sm leading-6">
                Ainda não existe um relacionamento contábil registrado para este cliente.
              </p>
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={handleStartCreate}
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:self-center"
              >
                <Plus className="h-4 w-4" />
                Cadastrar relacionamento
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!relationshipQuery.isLoading && !relationshipQuery.error && relationship ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-4 md:grid-cols-2">
            {CONTABIL_RELATIONSHIP_FIELDS.map((field) => (
              <div key={field.field} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-slate-500">
                  {field.label}
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {field.kind === "boolean"
                    ? relationship[field.field]
                      ? "Sim"
                      : "Não"
                    : relationship[field.field] || "Não informado"}
                </p>
              </div>
            ))}
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
        title={relationship ? "Editar relacionamento contábil" : "Cadastrar relacionamento contábil"}
        description="Cadastro do relacionamento contábil"
        contentClassName="w-[min(92vw,760px)]"
        bodyClassName="space-y-4"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {CONTABIL_RELATIONSHIP_TEXT_FIELDS.map((field) => (
              <label
                key={field.field}
                className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300"
              >
                <span>{field.label}</span>
                <input
                  type="text"
                  value={formValues[field.field]}
                  onChange={(event) =>
                    handleFieldChange(field.field, event.target.value)
                  }
                  disabled={!canEdit}
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
            ))}
          </div>

          {CONTABIL_RELATIONSHIP_TEXTAREA_FIELDS.map((field) => (
            <label
              key={field.field}
              className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300"
            >
              <span>{field.label}</span>
              <textarea
                rows={4}
                value={formValues[field.field]}
                onChange={(event) =>
                  handleFieldChange(field.field, event.target.value)
                }
                disabled={!canEdit}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
          ))}

          {CONTABIL_RELATIONSHIP_BOOLEAN_FIELDS.map((field) => (
            <label
              key={field.field}
              className="flex h-11 items-center gap-3 self-end rounded-lg bg-gray-50/70 px-3 text-sm text-gray-700 dark:bg-slate-900/40 dark:text-slate-300"
            >
              <input
                type="checkbox"
                checked={formValues[field.field]}
                onChange={(event) =>
                  handleFieldChange(field.field, event.target.checked)
                }
                disabled={!canEdit}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
              />
              <span>{field.label}</span>
            </label>
          ))}

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
                {relationship ? "Salvar alterações" : "Cadastrar relacionamento"}
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

            {relationship && canEdit ? (
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
        title="Remover relacionamento contábil"
        description="Confirmação de exclusão do relacionamento contábil"
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
          Esta ação remove o relacionamento contábil atual do cliente. Você poderá cadastrar um
          novo relacionamento depois, mas este registro será excluído agora.
        </p>
      </Dialog>
    </section>
  );
}
