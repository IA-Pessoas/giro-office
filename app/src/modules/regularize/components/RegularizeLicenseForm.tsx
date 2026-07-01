import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";

import type {
  CreateRegularizeLicensePayload,
  RegularizeLicenseDetail,
  UpdateRegularizeLicensePayload,
} from "../types";
import {
  getRegularizeMutationErrorMessage,
  toRegularizeInputDate,
  trimRegularizeNullableText,
  trimRegularizeOptionalUuid,
  trimRegularizeText,
} from "../utils/regularizeForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  type RegularizeFormOption,
  regularizeSelectClassName,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";

type RegularizeLicenseFormState = {
  client_id: string;
  has: boolean;
  type_license: string;
  entry_date: string;
  protocol: string;
  responsible_id: string;
  status: string;
  date_last_consultation: string;
  current_situation: string;
  contact: string;
  observation: string;
  urgency: string;
  type: string;
  due_date: string;
  task_id: string;
};

function buildLicenseFormState(
  license: RegularizeLicenseDetail | null,
  defaultClientId: string,
): RegularizeLicenseFormState {
  if (!license) {
    return {
      client_id: defaultClientId,
      has: true,
      type_license: "",
      entry_date: "",
      protocol: "",
      responsible_id: "",
      status: "Ativo",
      date_last_consultation: "",
      current_situation: "",
      contact: "",
      observation: "",
      urgency: "Média",
      type: "Anual",
      due_date: "",
      task_id: "",
    };
  }

  return {
    client_id: license.client_id ?? "",
    has: Boolean(license.has),
    type_license: license.type_license ?? "",
    entry_date: toRegularizeInputDate(license.entry_date),
    protocol: license.protocol ?? "",
    responsible_id: license.responsible_id ?? "",
    status: license.status ?? "Ativo",
    date_last_consultation: toRegularizeInputDate(license.date_last_consultation),
    current_situation: license.current_situation ?? "",
    contact: license.contact ?? "",
    observation: license.observation ?? "",
    urgency: license.urgency ?? "Média",
    type: license.type ?? "Anual",
    due_date: toRegularizeInputDate(license.due_date),
    task_id: license.task_id ?? "",
  };
}

function buildLicensePayload(formState: RegularizeLicenseFormState): CreateRegularizeLicensePayload {
  return {
    client_id: trimRegularizeOptionalUuid(formState.client_id),
    has: formState.has,
    type_license: trimRegularizeText(formState.type_license),
    entry_date: formState.entry_date,
    protocol: trimRegularizeText(formState.protocol),
    responsible_id: trimRegularizeOptionalUuid(formState.responsible_id),
    status: trimRegularizeText(formState.status),
    date_last_consultation: formState.date_last_consultation || undefined,
    current_situation: trimRegularizeText(formState.current_situation),
    contact: trimRegularizeText(formState.contact),
    observation: trimRegularizeNullableText(formState.observation),
    urgency: trimRegularizeText(formState.urgency),
    type: trimRegularizeText(formState.type),
    due_date: formState.due_date || undefined,
    task_id: trimRegularizeOptionalUuid(formState.task_id),
  };
}

export function RegularizeLicenseForm({
  clientOptions,
  defaultClientId,
  isLoadingInitialValue = false,
  isSubmitting,
  license,
  mode,
  onClose,
  onSubmit,
  open,
}: {
  clientOptions: RegularizeFormOption[];
  defaultClientId: string;
  isLoadingInitialValue?: boolean;
  isSubmitting: boolean;
  license: RegularizeLicenseDetail | null;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizeLicensePayload | UpdateRegularizeLicensePayload,
  ) => Promise<void>;
  open: boolean;
}) {
  const [formState, setFormState] = useState<RegularizeLicenseFormState>(
    buildLicenseFormState(license, defaultClientId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = mode === "edit";

  useEffect(() => {
    if (open) {
      setFormState(buildLicenseFormState(license, defaultClientId));
      setFormError(null);
    }
  }, [defaultClientId, license, open]);

  function handleChange<K extends keyof RegularizeLicenseFormState>(
    key: K,
    value: RegularizeLicenseFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (isLoadingInitialValue) {
      return;
    }

    if (isEditing && !license) {
      setFormError("Não foi possível carregar os dados da licença.");
      return;
    }

    if (
      !formState.type_license.trim() ||
      !formState.entry_date ||
      !formState.protocol.trim() ||
      !formState.status.trim() ||
      !formState.current_situation.trim() ||
      !formState.contact.trim() ||
      !formState.urgency.trim() ||
      !formState.type.trim()
    ) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    try {
      const payload = buildLicensePayload(formState);

      if (isEditing && license) {
        await onSubmit({
          ...payload,
          id: license.id,
        });
      } else {
        await onSubmit(payload);
      }
    } catch (error) {
      setFormError(getRegularizeMutationErrorMessage(error, "Não foi possível salvar a licença."));
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
      title={isEditing ? "Editar licença" : "Nova licença"}
      description="Formulário de licença do Regularize."
      contentClassName="w-[min(94vw,880px)]"
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
            <RegularizeFormField label="Cliente" className="md:col-span-2">
              <select
                value={formState.client_id}
                onChange={(event) => handleChange("client_id", event.target.value)}
                className={regularizeSelectClassName}
              >
                <option value="">Sem cliente vinculado</option>
                {clientOptions.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.label}
                    {client.description ? `, ${client.description}` : ""}
                  </option>
                ))}
              </select>
            </RegularizeFormField>

            <RegularizeFormField label="Possui?">
              <select
                value={formState.has ? "true" : "false"}
                onChange={(event) => handleChange("has", event.target.value === "true")}
                className={regularizeSelectClassName}
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </RegularizeFormField>

            <RegularizeFormField label="Licença" required>
              <input
                value={formState.type_license}
                onChange={(event) => handleChange("type_license", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Tipo" required>
              <input
                value={formState.type}
                onChange={(event) => handleChange("type", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Status" required>
              <input
                value={formState.status}
                onChange={(event) => handleChange("status", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Entrada" required>
              <input
                type="date"
                value={formState.entry_date}
                onChange={(event) => handleChange("entry_date", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Vencimento">
              <input
                type="date"
                value={formState.due_date}
                onChange={(event) => handleChange("due_date", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Última consulta">
              <input
                type="date"
                value={formState.date_last_consultation}
                onChange={(event) => handleChange("date_last_consultation", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Protocolo" required>
              <input
                value={formState.protocol}
                onChange={(event) => handleChange("protocol", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Situação atual" required>
              <input
                value={formState.current_situation}
                onChange={(event) => handleChange("current_situation", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Contato" required>
              <input
                value={formState.contact}
                onChange={(event) => handleChange("contact", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Urgência" required>
              <input
                value={formState.urgency}
                onChange={(event) => handleChange("urgency", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Responsável ID">
              <input
                value={formState.responsible_id}
                onChange={(event) => handleChange("responsible_id", event.target.value)}
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
            submitLabel={isEditing ? "Salvar alterações" : "Criar licença"}
          />
        </form>
      )}
    </Dialog>
  );
}
