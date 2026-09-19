import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";
import { ClientSelectionField } from "@modules/clients";
import { useAssignableUsers } from "@modules/rh";

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
  getRegularizePresetOptions,
  regularizeLicenseStatusOptions,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
  regularizeUrgencyOptions,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

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

const LICENSE_PROTOCOL_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const LICENSE_PROTOCOL_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
      status: "Em Processo de Solicitação",
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
    status: license.status ?? "Em Processo de Solicitação",
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
  defaultClientId,
  isLoadingInitialValue = false,
  isOpeningProtocol,
  isSubmitting,
  license,
  mode,
  onClose,
  onOpenProtocol,
  onSubmit,
  open,
}: {
  defaultClientId: string;
  isLoadingInitialValue?: boolean;
  isOpeningProtocol: boolean;
  isSubmitting: boolean;
  license: RegularizeLicenseDetail | null;
  mode: "create" | "edit";
  onClose: () => void;
  onOpenProtocol: () => Promise<void>;
  onSubmit: (
    payload: CreateRegularizeLicensePayload | UpdateRegularizeLicensePayload,
    protocolFile?: File,
  ) => Promise<void>;
  open: boolean;
}) {
  const [formState, setFormState] = useState<RegularizeLicenseFormState>(
    buildLicenseFormState(license, defaultClientId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [protocolFile, setProtocolFile] = useState<File | null>(null);
  const isEditing = mode === "edit";
  const responsibleUsersQuery = useAssignableUsers({ enabled: open, module: "regularize" });
  const responsibleUsers = responsibleUsersQuery.data ?? [];
  const hasSelectedResponsible = responsibleUsers.some(
    (user) => user.id === formState.responsible_id,
  );

  useEffect(() => {
    if (open) {
      setFormState(buildLicenseFormState(license, defaultClientId));
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

  function handleProtocolFileSelect(file: File | undefined) {
    if (!file) {
      setProtocolFile(null);
      return;
    }
    if (file.size > LICENSE_PROTOCOL_MAX_SIZE_BYTES) {
      setFormError("O protocolo deve ter no máximo 10 MB.");
      setProtocolFile(null);
      return;
    }
    if (!LICENSE_PROTOCOL_MIME_TYPES.has(file.type)) {
      setFormError("Selecione um protocolo em PDF, JPG, PNG ou WebP.");
      setProtocolFile(null);
      return;
    }

    setFormError(null);
    setProtocolFile(file);
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
        await onSubmit(
          {
            ...payload,
            id: license.id,
          },
          protocolFile ?? undefined,
        );
      } else {
        await onSubmit(payload, protocolFile ?? undefined);
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
              <ClientSelectionField clientId={formState.client_id} />
            </RegularizeFormField>

            <RegularizeFormField label="Possui ?">
              <RegularizeNativeSelect
                value={formState.has ? "true" : "false"}
                onChange={(event) => handleChange("has", event.target.value === "true")}
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </RegularizeNativeSelect>
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
              <RegularizeNativeSelect
                value={formState.status}
                onChange={(event) => handleChange("status", event.target.value)}
              >
                {getRegularizePresetOptions(regularizeLicenseStatusOptions, formState.status).map(
                  (status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ),
                )}
              </RegularizeNativeSelect>
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
              <RegularizeNativeSelect
                value={formState.urgency}
                onChange={(event) => handleChange("urgency", event.target.value)}
              >
                {getRegularizePresetOptions(regularizeUrgencyOptions, formState.urgency).map(
                  (urgency) => (
                    <option key={urgency} value={urgency}>
                      {urgency}
                    </option>
                  ),
                )}
              </RegularizeNativeSelect>
            </RegularizeFormField>

            <RegularizeFormField label="Responsável">
              <RegularizeNativeSelect
                value={formState.responsible_id}
                onChange={(event) => handleChange("responsible_id", event.target.value)}
                disabled={
                  isSubmitting || responsibleUsersQuery.isLoading || responsibleUsersQuery.isError
                }
              >
                <option value="">
                  {responsibleUsersQuery.isLoading
                    ? "Carregando responsáveis"
                    : responsibleUsersQuery.isError
                      ? "Responsáveis indisponíveis"
                      : "Sem responsável"}
                </option>
                {formState.responsible_id && !hasSelectedResponsible ? (
                  <option value={formState.responsible_id}>Responsável atual</option>
                ) : null}
                {responsibleUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </RegularizeNativeSelect>
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

            <RegularizeFormField label="Arquivo do protocolo" className="md:col-span-3">
              <div className="space-y-2">
                {license?.protocol_file ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/30">
                    <span className="min-w-0 truncate text-gray-700 dark:text-slate-200">
                      {license.protocol_file.original_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void onOpenProtocol()}
                      disabled={isOpeningProtocol}
                      className="font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60 dark:text-blue-400"
                    >
                      {isOpeningProtocol ? "Gerando acesso..." : "Abrir protocolo"}
                    </button>
                  </div>
                ) : null}
                <input
                  key={`${license?.id ?? "new"}-${open ? "open" : "closed"}`}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) => handleProtocolFileSelect(event.target.files?.[0])}
                  className={regularizeTextFieldClassName}
                />
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  PDF, JPG, PNG ou WebP, até 10 MB. Um novo envio substitui o protocolo vigente.
                </p>
              </div>
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
