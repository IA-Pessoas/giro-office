import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";
import { formatCpfCnpjInput, normalizeDigits } from "@shared/utils/inputFormatting";
import { ClientSelectionField } from "@modules/clients";
import { useIntegracaoTasksList } from "@modules/integracao";
import { useAssignableUsers } from "@modules/rh";

import type {
  CreateRegularizeProcessPayload,
  RegularizeProcessDetail,
  UpdateRegularizeProcessPayload,
} from "../types";
import {
  getRegularizeMutationErrorMessage,
  toRegularizeInputDate,
  trimRegularizeNullableText,
  trimRegularizeOptionalText,
  trimRegularizeOptionalUuid,
  trimRegularizeText,
} from "../utils/regularizeForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  getRegularizePresetOptions,
  regularizeFinancialStatusOptions,
  regularizeProcessStatusOptions,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
  regularizeUrgencyOptions,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import { RegularizeClientPfSelect } from "./RegularizeClientPfSelect";

type RegularizeProcessClientKind = "pj" | "pf";

type RegularizeProcessFormState = {
  clientKind: RegularizeProcessClientKind;
  client_id: string;
  cpf_cnpj: string;
  process_type: string;
  description: string;
  entry_date: string;
  completion_date: string;
  expected_date: string;
  status: string;
  financial_status: string;
  client_notice_date: string;
  observation: string;
  responsible1_id: string;
  responsible2_id: string;
  responsible3_id: string;
  locking_type: string;
  urgency: string;
  task_id: string;
};

function buildProcessFormState(
  process: RegularizeProcessDetail | null,
  defaultClientId: string,
): RegularizeProcessFormState {
  if (!process) {
    return {
      clientKind: "pj",
      client_id: defaultClientId,
      cpf_cnpj: "",
      process_type: "",
      description: "",
      entry_date: "",
      completion_date: "",
      expected_date: "",
      status: "Pendente",
      financial_status: "Pendente",
      client_notice_date: "",
      observation: "",
      responsible1_id: "",
      responsible2_id: "",
      responsible3_id: "",
      locking_type: "",
      urgency: "",
      task_id: "",
    };
  }

  return {
    clientKind: process.client_pf_id ? "pf" : "pj",
    client_id: process.client_pf_id ?? process.client_pj_id ?? "",
    cpf_cnpj: formatCpfCnpjInput(
      process.cpf_cnpj ?? process.clientPJ?.cpf_cnpj ?? process.clientPF?.cpf ?? "",
    ),
    process_type: process.process_type ?? "",
    description: process.description ?? "",
    entry_date: toRegularizeInputDate(process.entry_date),
    completion_date: toRegularizeInputDate(process.completion_date),
    expected_date: toRegularizeInputDate(process.expected_date),
    status: process.status ?? "Pendente",
    financial_status: process.financial_status ?? "Pendente",
    client_notice_date: toRegularizeInputDate(process.client_notice_date),
    observation: process.observation ?? "",
    responsible1_id: process.responsible1_id ?? "",
    responsible2_id: process.responsible2_id ?? "",
    responsible3_id: process.responsible3_id ?? "",
    locking_type: process.locking_type ?? "",
    urgency: process.urgency ?? "",
    task_id: process.task_id ?? "",
  };
}

function buildProcessPayload(formState: RegularizeProcessFormState): CreateRegularizeProcessPayload {
  return {
    client_pj_id:
      formState.clientKind === "pj" ? trimRegularizeOptionalUuid(formState.client_id) : undefined,
    client_pf_id:
      formState.clientKind === "pf" ? trimRegularizeOptionalUuid(formState.client_id) : undefined,
    cpf_cnpj: normalizeDigits(trimRegularizeText(formState.cpf_cnpj)),
    process_type: trimRegularizeText(formState.process_type),
    description: trimRegularizeText(formState.description),
    entry_date: formState.entry_date || undefined,
    completion_date: formState.completion_date || undefined,
    expected_date: formState.expected_date || undefined,
    client_notice_date: formState.client_notice_date || null,
    status: trimRegularizeText(formState.status),
    financial_status: formState.financial_status as Exclude<
      CreateRegularizeProcessPayload["financial_status"],
      undefined
    >,
    observation: trimRegularizeNullableText(formState.observation),
    responsible1_id: trimRegularizeOptionalUuid(formState.responsible1_id),
    responsible2_id: trimRegularizeOptionalUuid(formState.responsible2_id),
    responsible3_id: trimRegularizeOptionalUuid(formState.responsible3_id),
    locking_type: trimRegularizeNullableText(formState.locking_type),
    urgency: trimRegularizeNullableText(formState.urgency),
    task_id: trimRegularizeOptionalUuid(formState.task_id),
  };
}

const responsibleFields = [
  { key: "responsible1_id", label: "Responsável 1" },
  { key: "responsible2_id", label: "Responsável 2" },
  { key: "responsible3_id", label: "Responsável 3" },
] as const;

export function RegularizeProcessForm({
  defaultClientId,
  isLoadingInitialValue = false,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
  open,
  process,
}: {
  defaultClientId: string;
  isLoadingInitialValue?: boolean;
  isSubmitting: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizeProcessPayload | UpdateRegularizeProcessPayload,
  ) => Promise<void>;
  open: boolean;
  process: RegularizeProcessDetail | null;
}) {
  const [formState, setFormState] = useState<RegularizeProcessFormState>(
    buildProcessFormState(process, defaultClientId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const responsibleUsersQuery = useAssignableUsers({ enabled: open, module: "regularize" });
  const responsibleUsers = responsibleUsersQuery.data ?? [];
  const isEditing = mode === "edit";
  const tasksQuery = useIntegracaoTasksList(
    { status: "Todos", limit: 100, search: taskSearch },
    { enabled: open },
  );
  const taskOptions = (tasksQuery.data?.data ?? []).map((task) => ({
    id: task.id,
    label: `${task.name} — ${task.status}`,
  }));

  if (formState.task_id && !taskOptions.some((task) => task.id === formState.task_id)) {
    taskOptions.push({ id: formState.task_id, label: "Task vinculada (fora da lista)" });
  }

  const taskQueryMessage = tasksQuery.isLoading
    ? "Carregando tasks..."
    : tasksQuery.error
      ? `Erro ao carregar tasks: ${tasksQuery.error.message}`
      : null;

  useEffect(() => {
    if (open) {
      setFormState(buildProcessFormState(process, defaultClientId));
      setFormError(null);
      setTaskSearch("");
    }
  }, [defaultClientId, open, process]);

  function handleChange<K extends keyof RegularizeProcessFormState>(
    key: K,
    value: RegularizeProcessFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleClientKindChange(value: RegularizeProcessClientKind) {
    setFormState((current) => ({
      ...current,
      clientKind: value,
      client_id: "",
    }));
  }

  function handleClientPfChange(clientId: string, cpf?: string | null) {
    setFormState((current) => ({
      ...current,
      client_id: clientId,
      cpf_cnpj: cpf ? formatCpfCnpjInput(cpf) : current.cpf_cnpj,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (isLoadingInitialValue) {
      return;
    }

    if (isEditing && !process) {
      setFormError("Não foi possível carregar os dados do processo.");
      return;
    }

    if (
      !formState.client_id ||
      !formState.cpf_cnpj.trim() ||
      !formState.process_type.trim() ||
      !formState.description.trim() ||
      !formState.status.trim()
    ) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    if (
      !regularizeFinancialStatusOptions.includes(
        formState.financial_status as (typeof regularizeFinancialStatusOptions)[number],
      )
    ) {
      setFormError("Escolha um status financeiro reconhecido antes de salvar.");
      return;
    }

    try {
      const payload = buildProcessPayload(formState);

      if (isEditing && process) {
        await onSubmit({
          ...payload,
          id: process.id,
        });
      } else {
        await onSubmit(payload);
      }
    } catch (error) {
      setFormError(getRegularizeMutationErrorMessage(error, "Não foi possível salvar o processo."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title={isEditing ? "Editar processo" : "Novo processo"}
      description="Formulário de processo do Regularize."
      contentClassName="w-[min(94vw,920px)]"
      bodyClassName="max-h-[72vh] overflow-y-auto"
    >
      {isLoadingInitialValue ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          Carregando dados...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <RegularizeFormError message={formError} />

          <div className="grid gap-4 md:grid-cols-3">
            <RegularizeFormField label="Tipo de cliente" required>
              <RegularizeNativeSelect
                value={formState.clientKind}
                onChange={(event) =>
                  handleClientKindChange(event.target.value as RegularizeProcessClientKind)
                }
              >
                <option value="pj">PJ</option>
                <option value="pf">PF</option>
              </RegularizeNativeSelect>
            </RegularizeFormField>

            <fieldset className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
              <legend className="inline-flex items-center gap-1">
                <span>Cliente</span>
                <span className="text-red-500">*</span>
              </legend>
              {formState.clientKind === "pj" ? (
                <ClientSelectionField clientId={formState.client_id} />
              ) : (
                <RegularizeClientPfSelect
                  value={formState.client_id}
                  onChange={(id, option) => handleClientPfChange(id, option?.cpf)}
                />
              )}
            </fieldset>

            <RegularizeFormField label="CPF/CNPJ" required>
              <input
                value={formState.cpf_cnpj}
                onChange={(event) =>
                  handleChange("cpf_cnpj", formatCpfCnpjInput(event.target.value))
                }
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Tipo do processo" required>
              <input
                value={formState.process_type}
                onChange={(event) => handleChange("process_type", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Status" required>
              <RegularizeNativeSelect
                value={formState.status}
                onChange={(event) => handleChange("status", event.target.value)}
              >
                {getRegularizePresetOptions(regularizeProcessStatusOptions, formState.status).map(
                  (status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ),
                )}
              </RegularizeNativeSelect>
            </RegularizeFormField>

            <RegularizeFormField label="Status financeiro" required>
              <RegularizeNativeSelect
                value={formState.financial_status}
                onChange={(event) =>
                  handleChange(
                    "financial_status",
                    event.target.value as RegularizeProcessFormState["financial_status"],
                  )
                }
              >
                {getRegularizePresetOptions(
                  regularizeFinancialStatusOptions,
                  formState.financial_status,
                ).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </RegularizeNativeSelect>
            </RegularizeFormField>

            <RegularizeFormField label="Aviso ao cliente">
              <input
                type="date"
                value={formState.client_notice_date}
                onChange={(event) => handleChange("client_notice_date", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Entrada">
              <input
                type="date"
                value={formState.entry_date}
                onChange={(event) => handleChange("entry_date", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Previsão">
              <input
                type="date"
                value={formState.expected_date}
                onChange={(event) => handleChange("expected_date", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Conclusão">
              <input
                type="date"
                value={formState.completion_date}
                onChange={(event) => handleChange("completion_date", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Urgência">
              <RegularizeNativeSelect
                value={formState.urgency}
                onChange={(event) => handleChange("urgency", event.target.value)}
              >
                <option value="">Sem urgência</option>
                {getRegularizePresetOptions(regularizeUrgencyOptions, formState.urgency).map(
                  (urgency) => (
                    <option key={urgency} value={urgency}>
                      {urgency}
                    </option>
                  ),
                )}
              </RegularizeNativeSelect>
            </RegularizeFormField>

            {responsibleFields.map((field) => {
              const selectedResponsibleId = formState[field.key];
              const hasSelectedResponsible = responsibleUsers.some(
                (user) => user.id === selectedResponsibleId,
              );

              return (
                <RegularizeFormField key={field.key} label={field.label}>
                  <RegularizeNativeSelect
                    value={selectedResponsibleId}
                    onChange={(event) => handleChange(field.key, event.target.value)}
                    disabled={
                      isSubmitting ||
                      responsibleUsersQuery.isLoading ||
                      Boolean(responsibleUsersQuery.error)
                    }
                  >
                    <option value="">
                      {responsibleUsersQuery.isLoading
                        ? "Carregando responsáveis"
                        : responsibleUsersQuery.error
                          ? "Responsáveis indisponíveis"
                          : "Sem responsável"}
                    </option>
                    {selectedResponsibleId && !hasSelectedResponsible ? (
                      <option value={selectedResponsibleId}>Responsável atual</option>
                    ) : null}
                    {responsibleUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </RegularizeNativeSelect>
                </RegularizeFormField>
              );
            })}

            <RegularizeFormField label="Tipo de bloqueio">
              <input
                value={formState.locking_type}
                onChange={(event) => handleChange("locking_type", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Buscar task">
              <input
                type="search"
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                placeholder="Buscar task por nome ou identificador"
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Task ID">
              <RegularizeNativeSelect
                value={formState.task_id}
                onChange={(event) => handleChange("task_id", event.target.value)}
                disabled={tasksQuery.isLoading || Boolean(tasksQuery.error)}
              >
                <option value="">Sem task vinculada</option>
                {taskOptions.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.label}
                  </option>
                ))}
              </RegularizeNativeSelect>
              {taskQueryMessage ? (
                <span className="text-xs text-gray-500 dark:text-slate-400">{taskQueryMessage}</span>
              ) : null}
            </RegularizeFormField>

            <RegularizeFormField label="Descrição" required className="md:col-span-3">
              <textarea
                value={formState.description}
                onChange={(event) => handleChange("description", event.target.value)}
                className={regularizeTextareaClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Observação" className="md:col-span-3">
              <textarea
                value={formState.observation}
                onChange={(event) => handleChange("observation", event.target.value)}
                className={regularizeTextareaClassName}
              />
            </RegularizeFormField>
          </div>

          <RegularizeFormActions
            isSubmitting={isSubmitting}
            onCancel={onClose}
            submitLabel={isEditing ? "Salvar alterações" : "Criar processo"}
          />
        </form>
      )}
    </Dialog>
  );
}
