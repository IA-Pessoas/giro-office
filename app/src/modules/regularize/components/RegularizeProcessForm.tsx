import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";

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
  type RegularizeFormOption,
  getRegularizePresetOptions,
  regularizeProcessStatusOptions,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
  regularizeUrgencyOptions,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import { RegularizeClientPickerField } from "./RegularizeClientPickerField";

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
  observation: string;
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
      status: "Aberto",
      observation: "",
      locking_type: "",
      urgency: "",
      task_id: "",
    };
  }

  return {
    clientKind: process.client_pf_id ? "pf" : "pj",
    client_id: process.client_pf_id ?? process.client_pj_id ?? "",
    cpf_cnpj: process.cpf_cnpj ?? process.clientPJ?.cpf_cnpj ?? process.clientPF?.cpf ?? "",
    process_type: process.process_type ?? "",
    description: process.description ?? "",
    entry_date: toRegularizeInputDate(process.entry_date),
    completion_date: toRegularizeInputDate(process.completion_date),
    expected_date: toRegularizeInputDate(process.expected_date),
    status: process.status ?? "Aberto",
    observation: process.observation ?? "",
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
    cpf_cnpj: trimRegularizeText(formState.cpf_cnpj),
    process_type: trimRegularizeText(formState.process_type),
    description: trimRegularizeText(formState.description),
    entry_date: formState.entry_date || undefined,
    completion_date: formState.completion_date || undefined,
    expected_date: formState.expected_date || undefined,
    status: trimRegularizeText(formState.status),
    observation: trimRegularizeNullableText(formState.observation),
    locking_type: trimRegularizeNullableText(formState.locking_type),
    urgency: trimRegularizeNullableText(formState.urgency),
    task_id: trimRegularizeOptionalUuid(formState.task_id),
  };
}

export function RegularizeProcessForm({
  defaultClientId,
  isLoadingInitialValue = false,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
  open,
  pfOptions,
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
  pfOptions: RegularizeFormOption[];
  process: RegularizeProcessDetail | null;
}) {
  const [formState, setFormState] = useState<RegularizeProcessFormState>(
    buildProcessFormState(process, defaultClientId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = mode === "edit";
  const currentClientOptions = pfOptions;

  useEffect(() => {
    if (open) {
      setFormState(buildProcessFormState(process, defaultClientId));
      setFormError(null);
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
    const options = value === "pf" ? pfOptions : [];

    setFormState((current) => ({
      ...current,
      clientKind: value,
      client_id: options[0]?.id ?? "",
      cpf_cnpj: options[0]?.description ?? current.cpf_cnpj,
    }));
  }

  function handleClientChange(clientId: string) {
    const selected = currentClientOptions.find((option) => option.id === clientId);

    setFormState((current) => ({
      ...current,
      client_id: clientId,
      cpf_cnpj: selected?.description ?? current.cpf_cnpj,
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

            <RegularizeFormField label="Cliente" required className="md:col-span-2">
              {formState.clientKind === "pj" ? (
                <RegularizeClientPickerField
                  value={formState.client_id}
                  onChange={(clientId) => handleChange("client_id", clientId)}
                />
              ) : (
                <RegularizeNativeSelect
                  value={formState.client_id}
                  onChange={(event) => handleClientChange(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {currentClientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.label}
                      {client.description ? `, ${client.description}` : ""}
                    </option>
                  ))}
                </RegularizeNativeSelect>
              )}
            </RegularizeFormField>

            <RegularizeFormField label="CPF/CNPJ" required>
              <input
                value={formState.cpf_cnpj}
                onChange={(event) => handleChange("cpf_cnpj", event.target.value)}
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

            <RegularizeFormField label="Tipo de bloqueio">
              <input
                value={formState.locking_type}
                onChange={(event) => handleChange("locking_type", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Task ID">
              <input
                value={formState.task_id}
                onChange={(event) => handleChange("task_id", event.target.value)}
                className={regularizeTextFieldClassName}
              />
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
