import { AlertCircle, Loader2, Save, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import type {
  CreateParcelamentoInstallmentCompetencyPayload,
  ParcelamentoInstallmentCompetency,
  PatchParcelamentoInstallmentCompetencyPayload,
} from "../types";
import { getParcelamentoErrorMessage } from "../utils/parcelamentoError";
import { ParcelamentoNativeSelect } from "./ParcelamentoNativeSelect";
import {
  parcelamentoCheckboxCardClassName,
  parcelamentoPrimaryButtonClassName,
  parcelamentoSecondaryButtonClassName,
  parcelamentoTextFieldClassName,
} from "./parcelamentoFormControls";

type NullableBooleanInput = "" | "true" | "false";

interface CompetencyFormState {
  competence: string;
  how_many_paid: string;
  how_many_overdue: string;
  download: boolean;
  download_notes: string;
  upload_file: NullableBooleanInput;
  is_sent: NullableBooleanInput;
  submission_type: string;
  notes: string;
  installment_amount: string;
}

interface ParcelamentoCompetencyFormProps {
  canEdit: boolean;
  initialValue?: ParcelamentoInstallmentCompetency | null;
  isSubmitting: boolean;
  submitError: unknown;
  onCancel: () => void;
  onCreate: (payload: CreateParcelamentoInstallmentCompetencyPayload) => Promise<void>;
  onUpdate: (payload: PatchParcelamentoInstallmentCompetencyPayload) => Promise<void>;
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toNullableBoolean(value: NullableBooleanInput) {
  if (value === "") {
    return null;
  }

  return value === "true";
}

function fromNullableBoolean(value: boolean | null): NullableBooleanInput {
  if (value === null) {
    return "";
  }

  return value ? "true" : "false";
}

function toNonNegativeInteger(value: string, label: string) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} deve ser um número inteiro maior ou igual a zero.`);
  }

  return numberValue;
}

function toNonNegativeNumber(value: string, label: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${label} deve ser maior ou igual a zero.`);
  }

  return numberValue;
}

function getInitialState(
  initialValue?: ParcelamentoInstallmentCompetency | null,
): CompetencyFormState {
  return {
    competence: initialValue?.competence ?? getCurrentMonth(),
    how_many_paid: String(initialValue?.how_many_paid ?? 0),
    how_many_overdue: String(initialValue?.how_many_overdue ?? 0),
    download: initialValue?.download ?? false,
    download_notes: initialValue?.download_notes ?? "",
    upload_file: fromNullableBoolean(initialValue?.upload_file ?? null),
    is_sent: fromNullableBoolean(initialValue?.is_sent ?? null),
    submission_type: initialValue?.submission_type ?? "",
    notes: initialValue?.notes ?? "",
    installment_amount: String(initialValue?.installment_amount ?? 0),
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

export function ParcelamentoCompetencyForm({
  canEdit,
  initialValue,
  isSubmitting,
  submitError,
  onCancel,
  onCreate,
  onUpdate,
}: ParcelamentoCompetencyFormProps) {
  const [formState, setFormState] = useState(() => getInitialState(initialValue));
  const [localError, setLocalError] = useState<string | null>(null);
  const isEditing = Boolean(initialValue);
  const isDisabled = !canEdit || isSubmitting;
  const errorMessage =
    localError ??
    (submitError
      ? getParcelamentoErrorMessage(submitError, "Não foi possível salvar a competência.")
      : null);

  useEffect(() => {
    setFormState(getInitialState(initialValue));
    setLocalError(null);
  }, [initialValue]);

  function updateField<Key extends keyof CompetencyFormState>(
    key: Key,
    value: CompetencyFormState[Key],
  ) {
    setFormState((current) => ({ ...current, [key]: value }));
    setLocalError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!canEdit) {
      return;
    }

    try {
      if (!isEditing && formState.competence.trim().length === 0) {
        throw new Error("Informe a competência.");
      }

      const commonPayload = {
        how_many_paid: toNonNegativeInteger(formState.how_many_paid, "Pagas"),
        how_many_overdue: toNonNegativeInteger(formState.how_many_overdue, "Vencidas"),
        download: formState.download,
        download_notes: formState.download_notes,
        upload_file: toNullableBoolean(formState.upload_file),
        is_sent: toNullableBoolean(formState.is_sent),
        submission_type: formState.submission_type,
        notes: formState.notes,
        installment_amount: toNonNegativeNumber(formState.installment_amount, "Valor"),
      };

      if (isEditing) {
        await onUpdate(commonPayload);
        return;
      }

      await onCreate({
        ...commonPayload,
        competence: formState.competence,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {isEditing ? "A competência não pode ser alterada." : "Informe a competência mensal."}
      </p>

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
        <Field label="Competência" required={!isEditing}>
          <input
            type="month"
            value={formState.competence}
            onChange={(event) => updateField("competence", event.target.value)}
            disabled={isEditing || isDisabled}
            className={parcelamentoTextFieldClassName}
          />
        </Field>
        <Field label="Pagas" required>
          <input
            type="number"
            min={0}
            step={1}
            value={formState.how_many_paid}
            onChange={(event) => updateField("how_many_paid", event.target.value)}
            disabled={isDisabled}
            className={parcelamentoTextFieldClassName}
          />
        </Field>
        <Field label="Vencidas" required>
          <input
            type="number"
            min={0}
            step={1}
            value={formState.how_many_overdue}
            onChange={(event) => updateField("how_many_overdue", event.target.value)}
            disabled={isDisabled}
            className={parcelamentoTextFieldClassName}
          />
        </Field>
        <Field label="Valor" required>
          <input
            type="number"
            min={0}
            step="0.01"
            value={formState.installment_amount}
            onChange={(event) => updateField("installment_amount", event.target.value)}
            disabled={isDisabled}
            className={parcelamentoTextFieldClassName}
          />
        </Field>
        <Field label="Upload">
          <ParcelamentoNativeSelect
            value={formState.upload_file}
            onChange={(event) =>
              updateField("upload_file", event.target.value as NullableBooleanInput)
            }
            disabled={isDisabled}
          >
            <option value="">Não informado</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </ParcelamentoNativeSelect>
        </Field>
        <Field label="Enviado">
          <ParcelamentoNativeSelect
            value={formState.is_sent}
            onChange={(event) => updateField("is_sent", event.target.value as NullableBooleanInput)}
            disabled={isDisabled}
          >
            <option value="">Não informado</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </ParcelamentoNativeSelect>
        </Field>
        <Field label="Tipo de envio">
          <input
            type="text"
            value={formState.submission_type}
            onChange={(event) => updateField("submission_type", event.target.value)}
            disabled={isDisabled}
            className={parcelamentoTextFieldClassName}
          />
        </Field>
        <Field label="Observação do download">
          <input
            type="text"
            value={formState.download_notes}
            onChange={(event) => updateField("download_notes", event.target.value)}
            disabled={isDisabled}
            className={parcelamentoTextFieldClassName}
          />
        </Field>

        <label className={`${parcelamentoCheckboxCardClassName} self-end w-fit`}>
          <input
            type="checkbox"
            checked={formState.download}
            onChange={(event) => updateField("download", event.target.checked)}
            disabled={isDisabled}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Arquivo baixado
        </label>
      </div>

      <Field label="Notas">
        <textarea
          rows={2}
          value={formState.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          disabled={isDisabled}
          className={parcelamentoTextFieldClassName}
        />
      </Field>

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
