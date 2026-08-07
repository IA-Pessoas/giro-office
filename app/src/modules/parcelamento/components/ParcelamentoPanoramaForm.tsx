import { AlertCircle, Loader2, Save, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import type {
  CreateParcelamentoPanoramaPayload,
  ParcelamentoClientOption,
  ParcelamentoPanorama,
  ParcelamentoResponsibleUser,
  PatchParcelamentoPanoramaPayload,
} from "../types";
import { getParcelamentoErrorMessage } from "../utils/parcelamentoError";
import { getCurrentParcelamentoMonth } from "../utils/parcelamentoMonth";
import {
  parcelamentoCheckboxCardClassName,
  parcelamentoPrimaryButtonClassName,
  parcelamentoSecondaryButtonClassName,
  parcelamentoTextFieldClassName,
} from "./parcelamentoFormControls";
import { ParcelamentoNativeSelect } from "./ParcelamentoNativeSelect";

type PanoramaBooleanField =
  | "cnd_municipal"
  | "cnd_state"
  | "cnd_federal"
  | "cnd_fgts"
  | "cnd_labor"
  | "protests"
  | "state_tax_situation"
  | "federal_tax_situation";

type PanoramaFormState = Record<PanoramaBooleanField, boolean> & {
  competence: string;
  responsavel_id: string;
};

interface ParcelamentoPanoramaFormProps {
  selectedClient: ParcelamentoClientOption | null;
  canEdit: boolean;
  responsibleUsers?: ParcelamentoResponsibleUser[];
  isResponsibleUsersLoading?: boolean;
  initialValue?: ParcelamentoPanorama | null;
  isSubmitting: boolean;
  submitError: unknown;
  onCancel: () => void;
  onCreate: (payload: CreateParcelamentoPanoramaPayload) => Promise<void>;
  onUpdate: (payload: PatchParcelamentoPanoramaPayload) => Promise<void>;
}

const panoramaBooleanFields: Array<{ key: PanoramaBooleanField; label: string }> = [
  { key: "cnd_municipal", label: "CND municipal" },
  { key: "cnd_state", label: "CND estadual" },
  { key: "cnd_federal", label: "CND federal" },
  { key: "cnd_fgts", label: "CND FGTS" },
  { key: "cnd_labor", label: "CND trabalhista" },
  { key: "protests", label: "Protestos" },
  { key: "state_tax_situation", label: "Situação estadual" },
  { key: "federal_tax_situation", label: "Situação federal" },
];

function getInitialState(initialValue?: ParcelamentoPanorama | null): PanoramaFormState {
  return {
    competence: initialValue?.competence ?? getCurrentParcelamentoMonth(),
    cnd_municipal: initialValue?.cnd_municipal ?? false,
    cnd_state: initialValue?.cnd_state ?? false,
    cnd_federal: initialValue?.cnd_federal ?? false,
    cnd_fgts: initialValue?.cnd_fgts ?? false,
    cnd_labor: initialValue?.cnd_labor ?? false,
    protests: initialValue?.protests ?? false,
    state_tax_situation: initialValue?.state_tax_situation ?? false,
    federal_tax_situation: initialValue?.federal_tax_situation ?? false,
    responsavel_id: initialValue?.responsavel_id ?? "",
  };
}

function Field({
  children,
  label,
  required,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300">
      <span>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export function ParcelamentoPanoramaForm({
  selectedClient,
  canEdit,
  responsibleUsers = [],
  isResponsibleUsersLoading = false,
  initialValue,
  isSubmitting,
  submitError,
  onCancel,
  onCreate,
  onUpdate,
}: ParcelamentoPanoramaFormProps) {
  const [formState, setFormState] = useState(() => getInitialState(initialValue));
  const [localError, setLocalError] = useState<string | null>(null);
  const isEditing = Boolean(initialValue);
  const isDisabled = !canEdit || isSubmitting;
  const currentResponsibleId = initialValue?.responsavel_id?.trim() ?? "";
  const shouldShowCurrentResponsible =
    currentResponsibleId.length > 0 &&
    !responsibleUsers.some((responsibleUser) => responsibleUser.id === currentResponsibleId);
  const errorMessage =
    localError ??
    (submitError
      ? getParcelamentoErrorMessage(submitError, "Não foi possível salvar o panorama.")
      : null);

  useEffect(() => {
    setFormState(getInitialState(initialValue));
    setLocalError(null);
  }, [initialValue]);

  function updateField<Key extends keyof PanoramaFormState>(
    key: Key,
    value: PanoramaFormState[Key],
  ) {
    setFormState((current) => ({ ...current, [key]: value }));
    setLocalError(null);
  }

  function buildBooleanPayload() {
    return {
      cnd_municipal: formState.cnd_municipal,
      cnd_state: formState.cnd_state,
      cnd_federal: formState.cnd_federal,
      cnd_fgts: formState.cnd_fgts,
      cnd_labor: formState.cnd_labor,
      protests: formState.protests,
      state_tax_situation: formState.state_tax_situation,
      federal_tax_situation: formState.federal_tax_situation,
      responsavel_id: formState.responsavel_id,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!canEdit) {
      return;
    }

    try {
      if (isEditing) {
        await onUpdate(buildBooleanPayload());
        return;
      }

      if (!selectedClient) {
        throw new Error("Selecione um cliente antes de criar o panorama.");
      }

      if (formState.competence.trim().length === 0) {
        throw new Error("Informe a competência.");
      }

      await onCreate({
        ...buildBooleanPayload(),
        client_id: selectedClient.id,
        competence: formState.competence,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {isEditing ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Cliente e competência não podem ser alterados.
        </p>
      ) : null}

      {errorMessage ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Cliente" required={!isEditing}>
          <input
            type="text"
            value={selectedClient?.name ?? initialValue?.client_id ?? "Nenhum cliente selecionado"}
            disabled
            className={parcelamentoTextFieldClassName}
          />
        </Field>
        <Field label="Competência" required={!isEditing}>
          <input
            type="month"
            value={formState.competence}
            onChange={(event) => updateField("competence", event.target.value)}
            disabled={isEditing || isDisabled}
            className={parcelamentoTextFieldClassName}
          />
        </Field>
        <Field label="Responsável">
          <ParcelamentoNativeSelect
            value={formState.responsavel_id}
            onChange={(event) => updateField("responsavel_id", event.target.value)}
            disabled={isDisabled || isResponsibleUsersLoading}
          >
            <option value="">Sem responsável</option>
            {shouldShowCurrentResponsible ? (
              <option value={currentResponsibleId}>Responsável atual</option>
            ) : null}
            {responsibleUsers.map((responsibleUser) => (
              <option key={responsibleUser.id} value={responsibleUser.id}>
                {responsibleUser.name}
              </option>
            ))}
          </ParcelamentoNativeSelect>
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {panoramaBooleanFields.map((field) => (
          <label key={field.key} className={parcelamentoCheckboxCardClassName}>
            <input
              type="checkbox"
              checked={formState[field.key]}
              onChange={(event) => updateField(field.key, event.target.checked)}
              disabled={isDisabled}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {field.label}
          </label>
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className={parcelamentoSecondaryButtonClassName}>
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <button type="submit" disabled={isDisabled} className={parcelamentoPrimaryButtonClassName}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </button>
      </div>
    </form>
  );
}
