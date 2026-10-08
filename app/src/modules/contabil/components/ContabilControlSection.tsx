import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Archive, CheckCircle2, CheckSquare, Loader2, Lock, RotateCcw } from "lucide-react";

import { ConfirmationDialog } from "@shared/components";

import {
  useContabilControlBootstrapMutation,
  useArchiveContabilCompetenceMutation,
  useCompleteContabilControlMutation,
  useCreateYearContabilControlsMutation,
  useContabilControlDetail,
  usePatchContabilControlFieldMutation,
  useRestoreContabilCompetenceMutation,
} from "../hooks";
import { getContabilErrorMessage } from "../services";
import type {
  ContabilCompetence,
  ContabilControl,
  ContabilControlField,
} from "../types";
import {
  CONTABIL_CONTROL_FIELDS,
  CONTABIL_CONTROL_CHECKLIST_FIELDS,
  CONTABIL_CONTROL_NOTES_FIELD,
} from "./contabilControlFields";
import {
  applyLocalContabilFieldValue,
  createContabilFieldStatusMap,
  formatContabilCount,
  getContabilCompletionPercent,
  getCurrentContabilCompetence,
  rollbackContabilFieldValue,
  shouldSyncRemoteContabilControl,
  type ContabilControlFieldSaveStatus,
  updateContabilControlFieldStatus,
} from "./contabilControlSection.helpers";
import { ContabilCompetenceSelect } from "./ContabilCompetenceSelect";
import { ContabilStateBox } from "./ContabilStateBox";

interface ContabilControlSectionProps {
  clientId: string;
  canEdit: boolean;
}

const SAVE_STATUS_LABELS: Record<ContabilControlFieldSaveStatus, string> = {
  idle: "",
  saving: "Salvando...",
  saved: "Salvo",
  error: "Falha ao salvar",
};

const SAVE_SUCCESS_FEEDBACK_MS = 1200;
const FIELD_SAVE_DEBOUNCE_MS = 400;

export function ContabilControlSection({
  clientId,
  canEdit,
}: ContabilControlSectionProps) {
  const bootstrapMutation = useContabilControlBootstrapMutation();
  const patchMutation = usePatchContabilControlFieldMutation();
  const completeAllMutation = useCompleteContabilControlMutation();
  const createYearMutation = useCreateYearContabilControlsMutation();
  const archiveMutation = useArchiveContabilCompetenceMutation();
  const restoreMutation = useRestoreContabilCompetenceMutation();
  const [competence, setCompetence] = useState(() => getCurrentContabilCompetence());
  // Abrir a aba só lê (GET); criar o controle é ação explícita em "Iniciar controle".
  const detailQuery = useContabilControlDetail({ clientId, competence });
  const remoteControl = detailQuery.data;
  const [controlId, setControlId] = useState<string | null>(null);
  const [control, setControl] = useState<ContabilControl | null>(null);
  const [fieldStatuses, setFieldStatuses] = useState(() =>
    createContabilFieldStatusMap(CONTABIL_CONTROL_FIELDS),
  );
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [confirmYearCreation, setConfirmYearCreation] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [archivedCompetence, setArchivedCompetence] = useState<ContabilCompetence | null>(null);

  const confirmedControlRef = useRef<ContabilControl | null>(null);
  const bootstrapRequestRef = useRef(0);
  const saveTimersRef = useRef<Map<ContabilControlField, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const successTimersRef = useRef<Map<ContabilControlField, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const checklistItems = useMemo(
    () =>
      CONTABIL_CONTROL_CHECKLIST_FIELDS.map((fieldDefinition) => ({
        ...fieldDefinition,
        checked: Boolean(control?.[fieldDefinition.field]),
        status: fieldStatuses[fieldDefinition.field],
      })),
    [control, fieldStatuses],
  );

  const completedCount = checklistItems.filter((item) => item.checked).length;
  const completionPercent = getContabilCompletionPercent(
    completedCount,
    checklistItems.length,
  );

  const notesValue = control?.notes ?? "";
  const isLoadingControl = detailQuery.isLoading || bootstrapMutation.isPending;
  const isAnyFieldSaving = useMemo(
    () => Object.values(fieldStatuses).some((status) => status === "saving"),
    [fieldStatuses],
  );

  useEffect(() => {
    setOperationError(null);
  }, [clientId, competence]);

  useEffect(() => {
    clearAllTimers();
    setBootstrapError(null);
    setControlId(null);
    setControl(null);
    setFieldStatuses(createContabilFieldStatusMap(CONTABIL_CONTROL_FIELDS));
    confirmedControlRef.current = null;

    return () => {
      clearAllTimers();
    };
  }, [clientId, competence, canEdit]);

  useEffect(() => {
    if (detailQuery.error) {
      setBootstrapError(getContabilErrorMessage(detailQuery.error));
      return;
    }
    const currentId = confirmedControlRef.current?.id ?? null;
    if (detailQuery.isLoading || !shouldSyncRemoteContabilControl(canEdit, currentId, remoteControl)) {
      return;
    }

    setBootstrapError(null);
    setControl(remoteControl ?? null);
    setControlId(remoteControl?.id ?? null);
    confirmedControlRef.current = remoteControl ?? null;
  }, [canEdit, detailQuery.error, detailQuery.isLoading, remoteControl]);

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  function clearAllTimers() {
    for (const timer of saveTimersRef.current.values()) {
      clearTimeout(timer);
    }

    for (const timer of successTimersRef.current.values()) {
      clearTimeout(timer);
    }

    saveTimersRef.current.clear();
    successTimersRef.current.clear();
  }

  function clearFieldTimers(field: ContabilControlField) {
    const saveTimer = saveTimersRef.current.get(field);
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimersRef.current.delete(field);
    }

    const successTimer = successTimersRef.current.get(field);
    if (successTimer) {
      clearTimeout(successTimer);
      successTimersRef.current.delete(field);
    }
  }

  function scheduleIdleReset(field: ContabilControlField) {
    clearFieldTimers(field);

    const timer = setTimeout(() => {
      setFieldStatuses((current) => updateContabilControlFieldStatus(current, field, "idle"));
      successTimersRef.current.delete(field);
    }, SAVE_SUCCESS_FEEDBACK_MS);

    successTimersRef.current.set(field, timer);
  }

  async function bootstrapControl(nextClientId: string, nextCompetence: ContabilCompetence) {
    const requestId = bootstrapRequestRef.current + 1;
    bootstrapRequestRef.current = requestId;

    clearAllTimers();
    setBootstrapError(null);
    setControlId(null);
    setControl(null);
    setFieldStatuses(createContabilFieldStatusMap(CONTABIL_CONTROL_FIELDS));
    confirmedControlRef.current = null;

    try {
      const nextControl = await bootstrapMutation.mutateAsync({
        client_id: nextClientId,
        competence: nextCompetence,
      });

      if (bootstrapRequestRef.current !== requestId) {
        return;
      }

      setControl(nextControl);
      setControlId(nextControl.id);
      confirmedControlRef.current = nextControl;
    } catch (error) {
      if (bootstrapRequestRef.current !== requestId) {
        return;
      }

      setBootstrapError(getContabilErrorMessage(error));
    }
  }

  function handleCompetenceChange(value: string) {
    if (isAnyFieldSaving) {
      return;
    }

    setCompetence((value || getCurrentContabilCompetence()) as ContabilCompetence);
  }

  function queueFieldSave(field: ContabilControlField, value: boolean | string) {
    if (!controlId || !control) {
      return;
    }

    clearFieldTimers(field);
    setFieldStatuses((current) => updateContabilControlFieldStatus(current, field, "saving"));

    const timer = setTimeout(async () => {
      try {
        const updatedControl = await patchMutation.mutateAsync({
          clientId,
          competence,
          controlId,
          payload: {
            field,
            value,
          },
        });

        confirmedControlRef.current = updatedControl;
        setControl(updatedControl);
        setFieldStatuses((current) => updateContabilControlFieldStatus(current, field, "saved"));
        scheduleIdleReset(field);
      } catch {
        setFieldStatuses((current) => updateContabilControlFieldStatus(current, field, "error"));

        if (field !== "notes" && confirmedControlRef.current) {
          setControl((current) =>
            current
              ? rollbackContabilFieldValue(current, confirmedControlRef.current!, field)
              : current,
          );
        }
      } finally {
        saveTimersRef.current.delete(field);
      }
    }, FIELD_SAVE_DEBOUNCE_MS);

    saveTimersRef.current.set(field, timer);
  }

  function handleChecklistChange(field: ContabilControlField, checked: boolean) {
    if (!control || !canEdit) {
      return;
    }

    setControl((current) =>
      current ? applyLocalContabilFieldValue(current, field, checked) : current,
    );
    queueFieldSave(field, checked);
  }

  function handleNotesChange(value: string) {
    if (!control || !canEdit) {
      return;
    }

    setControl((current) =>
      current ? applyLocalContabilFieldValue(current, "notes", value) : current,
    );
    queueFieldSave("notes", value);
  }

  // Erro de qualquer ação aparece na tela e os diálogos de confirmação fecham.
  async function runOperation(action: () => Promise<void>) {
    setOperationError(null);
    try {
      await action();
    } catch (error) {
      setOperationMessage(null);
      setOperationError(getContabilErrorMessage(error));
    }
  }

  function createYear() {
    return runOperation(async () => {
      const year = Number(competence.slice(0, 4));
      const result = await createYearMutation.mutateAsync({ client_id: clientId, year, confirmed: true });
      setOperationMessage(
        `${formatContabilCount(result.created, "competência criada", "competências criadas")}; ${formatContabilCount(result.existing, "já existia", "já existiam")}.`,
      );
    });
  }

  function completeAll() {
    return runOperation(async () => {
      if (!controlId) return;
      const updated = await completeAllMutation.mutateAsync({ controlId, clientId, competence });
      setControl(updated);
      confirmedControlRef.current = updated;
      setOperationMessage("Os 17 itens da competência foram marcados como concluídos.");
    });
  }

  function archiveCompetence() {
    return runOperation(async () => {
      await archiveMutation.mutateAsync({ client_id: clientId, competence });
      setControl(null);
      setControlId(null);
      setArchivedCompetence(competence);
      setOperationMessage(null);
    });
  }

  function restoreCompetence() {
    return runOperation(async () => {
      await restoreMutation.mutateAsync({ client_id: clientId, competence });
      setArchivedCompetence(null);
      setOperationMessage("Competência restaurada.");
    });
  }

  return (
    <section className="space-y-4">
      {!canEdit ? (
        <ContabilStateBox icon={Lock} title="Modo visualização" compact>
          Você pode acompanhar o checklist desta competência, mas não tem permissão para
          alterar os campos.
        </ContabilStateBox>
      ) : null}

      {isLoadingControl && !control ? (
        <ContabilStateBox icon={Loader2} tone="loading" title="Carregando controle" compact>
          Estamos preparando o checklist mensal desta competência.
        </ContabilStateBox>
      ) : null}

      {bootstrapError && !control ? (
        <ContabilStateBox
          icon={AlertCircle}
          tone="danger"
          title="Não foi possível carregar o controle"
          compact
        >
          {bootstrapError}
        </ContabilStateBox>
      ) : null}

      {!isLoadingControl && !bootstrapError && !control ? (
        <ContabilStateBox
          icon={archivedCompetence === competence ? Archive : AlertCircle}
          title={archivedCompetence === competence ? "Competência arquivada" : "Sem controle nesta competência"}
          compact
        >
          <span>
            {archivedCompetence === competence
              ? "Os registros foram preservados e podem ser restaurados."
              : "Ainda não há checklist contábil para esta competência."}
          </span>
          <span className="ml-2">
            <ContabilCompetenceSelect value={competence} onChange={handleCompetenceChange} />
          </span>
          {canEdit && archivedCompetence === competence ? (
            <button
              type="button"
              onClick={() => void restoreCompetence()}
              disabled={restoreMutation.isPending}
              className="ml-2 inline-flex items-center gap-1 font-semibold text-blue-700 disabled:opacity-60 dark:text-blue-300"
            >
              <RotateCcw className="h-4 w-4" /> Restaurar competência
            </button>
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => void bootstrapControl(clientId, competence)}
              disabled={bootstrapMutation.isPending}
              className="ml-2 inline-flex items-center gap-1 font-semibold text-blue-700 disabled:opacity-60 dark:text-blue-300"
            >
              Iniciar controle
            </button>
          ) : null}
        </ContabilStateBox>
      ) : null}

      {control ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Checklist operacional
                    </h3>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  Marque cada atividade concluída ao longo do fechamento da competência.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    role="progressbar"
                    aria-label="Conclusão da competência"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={completionPercent}
                    className="h-2 w-40 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700"
                  >
                    <div
                      className={`h-full rounded-full ${completionPercent === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium tabular-nums text-gray-700 dark:text-slate-300">
                    {`${completionPercent}% concluído (${completedCount}/${checklistItems.length})`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 whitespace-nowrap text-sm font-medium text-gray-600 dark:text-slate-400">
                    Competência
                  </span>
                  {isAnyFieldSaving ? (
                    <Loader2
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin text-gray-500 dark:text-slate-400"
                    />
                  ) : null}
                </div>
                <ContabilCompetenceSelect
                  value={competence}
                  onChange={handleCompetenceChange}
                  disabled={isAnyFieldSaving}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2"> 
              {checklistItems.map((item) => (
                <label
                  key={item.field}
                  className={`rounded-xl border p-3 transition-colors ${
                    item.checked
                      ? "border-blue-200 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-900/10"
                      : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                  } ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) =>
                        handleChecklistChange(item.field, event.target.checked)
                      }
                      disabled={!canEdit}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.label}
                        </p>
                        <FieldStatusBadge status={item.status} />
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {canEdit ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setConfirmYearCreation(true)} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 dark:border-blue-900/50 dark:text-blue-300">
                  Criar 12 competências do ano
                </button>
                <button type="button" onClick={() => void completeAll()} disabled={completeAllMutation.isPending} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60 dark:border-emerald-900/50 dark:text-emerald-300">
                  Marcar os 17 itens como concluídos
                </button>
                <button type="button" onClick={() => setConfirmArchive(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:text-red-300">
                  <Archive className="h-4 w-4" /> Arquivar competência
                </button>
                <ConfirmationDialog
                  open={confirmYearCreation}
                  onOpenChange={setConfirmYearCreation}
                  title="Criar 12 competências do ano"
                  description={`Criar as 12 competências de ${competence.slice(0, 4)} para este cliente? As que já existem são mantidas.`}
                  onConfirm={createYear}
                  isConfirming={createYearMutation.isPending}
                  errorMessage={null}
                  confirmLabel="Criar competências"
                  cancelLabel="Cancelar"
                  variant="neutral"
                />
                <ConfirmationDialog
                  open={confirmArchive}
                  onOpenChange={setConfirmArchive}
                  title="Arquivar competência"
                  description={`Arquivar a competência ${competence.slice(5)}/${competence.slice(0, 4)}?`}
                  onConfirm={archiveCompetence}
                  isConfirming={archiveMutation.isPending}
                  errorMessage={null}
                  confirmLabel="Arquivar"
                  cancelLabel="Cancelar"
                />
              </div>
            ) : null}
          </div>

          {CONTABIL_CONTROL_NOTES_FIELD ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {CONTABIL_CONTROL_NOTES_FIELD.label}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  Registre observações complementares desta competência.
                </p>
              </div>

              <FieldStatusBadge status={fieldStatuses.notes} />

              <div className="mt-4">
                <textarea
                  value={notesValue}
                  onChange={(event) => handleNotesChange(event.target.value)}
                  disabled={!canEdit}
                  rows={4}
                  placeholder="Adicione observações do fechamento, pendências ou contexto relevante."
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {operationError ? (
        <ContabilStateBox icon={AlertCircle} tone="danger" title="Não foi possível concluir a operação" compact>
          <span role="alert">{operationError}</span>
        </ContabilStateBox>
      ) : null}

      {operationMessage ? (
        <ContabilStateBox icon={CheckCircle2} title="Operação mensal concluída" compact>
          <span>{operationMessage}</span>
        </ContabilStateBox>
      ) : null}
    </section>
  );
}

function FieldStatusBadge({ status }: { status: ContabilControlFieldSaveStatus }) {
  if (status === "idle") {
    return null;
  }

  const className =
    status === "error"
      ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
      : status === "saved"
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
        : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${className}`}
    >
      {status === "saved" ? <CheckCircle2 className="h-3 w-3" /> : null}
      {SAVE_STATUS_LABELS[status]}
    </span>
  );
}
