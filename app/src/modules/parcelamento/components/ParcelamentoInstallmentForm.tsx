import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Loader2, Save, X } from "lucide-react";

import { buildPatchInstallmentPayload } from "../services";
import type {
  CreateParcelamentoInstallmentPayload,
  ParcelamentoClientOption,
  ParcelamentoInstallment,
  PatchParcelamentoInstallmentPayload,
} from "../types";
import { getParcelamentoErrorMessage } from "../utils/parcelamentoError";
import {
  INSTALLMENT_JURISDICTION_OPTIONS,
  INSTALLMENT_TYPE_OPTIONS,
  parcelamentoCheckboxCardClassName,
  parcelamentoPrimaryButtonClassName,
  parcelamentoSecondaryButtonClassName,
  parcelamentoTextFieldClassName,
} from "./parcelamentoFormControls";
import { ParcelamentoNativeSelect } from "./ParcelamentoNativeSelect";

type ParcelamentoInstallmentFormMode = "create" | "edit";

interface ParcelamentoInstallmentFormProps {
  mode: ParcelamentoInstallmentFormMode;
  installment?: ParcelamentoInstallment | null;
  selectedClient: ParcelamentoClientOption | null;
  canEdit: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onCreate: (payload: CreateParcelamentoInstallmentPayload) => Promise<unknown>;
  onUpdate: (payload: PatchParcelamentoInstallmentPayload) => Promise<unknown>;
}

interface ParcelamentoInstallmentFormState {
  agreement_number: string;
  type: string;
  legal_nature: string;
  jurisdiction: string;
  is_automatic_debit: boolean;
  consolidated_total_amount: string;
  first_installment_amount: string;
  current_month_installment_amount: string;
  agreed_installments_count: string;
  enrollment_date: string;
  status: string;
  document_url: string;
  situation_shutdown: string;
  completion_date: string;
}

export const INSTALLMENT_STATUS_OPTIONS = [
  "Ativo",
  "Liquidado",
  "Cancelado",
  "Encerrado",
  "Inativo",
];

const emptyInstallmentFormState: ParcelamentoInstallmentFormState = {
  agreement_number: "",
  type: "",
  legal_nature: "",
  jurisdiction: "",
  is_automatic_debit: false,
  consolidated_total_amount: "",
  first_installment_amount: "",
  current_month_installment_amount: "",
  agreed_installments_count: "",
  enrollment_date: "",
  status: "Ativo",
  document_url: "",
  situation_shutdown: "",
  completion_date: "",
};

function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function buildFormState(
  installment: ParcelamentoInstallment | null | undefined,
): ParcelamentoInstallmentFormState {
  if (!installment) {
    return emptyInstallmentFormState;
  }

  return {
    agreement_number: installment.agreement_number ?? "",
    type: installment.type,
    legal_nature: installment.legal_nature,
    jurisdiction: installment.jurisdiction,
    is_automatic_debit: installment.is_automatic_debit,
    consolidated_total_amount: String(installment.consolidated_total_amount),
    first_installment_amount: String(installment.first_installment_amount),
    current_month_installment_amount: String(installment.current_month_installment_amount),
    agreed_installments_count: String(installment.agreed_installments_count),
    enrollment_date: toDateInputValue(installment.enrollment_date),
    status: installment.status,
    document_url: installment.document_url ?? "",
    situation_shutdown: installment.situation_shutdown ?? "",
    completion_date: toDateInputValue(installment.completion_date),
  };
}

const REQUIRED_FIELD_LABELS: Array<[keyof ParcelamentoInstallmentFormState, string]> = [
  ["type", "Tipo"],
  ["legal_nature", "Natureza jurídica"],
  ["jurisdiction", "Jurisdição"],
  ["consolidated_total_amount", "Valor total do parcelamento"],
  ["first_installment_amount", "Valor da 1ª parcela"],
  ["current_month_installment_amount", "Valor da parcela atual"],
  ["agreed_installments_count", "Quantidade de parcelas"],
];

function getMissingRequiredFields(formState: ParcelamentoInstallmentFormState) {
  return REQUIRED_FIELD_LABELS.filter(([field]) => !String(formState[field]).trim()).map(
    ([, label]) => label,
  );
}

function readRequiredNumber(value: string) {
  return value.trim().length > 0 ? Number(value) : 0;
}

function readChangedNumber(value: string) {
  return value.trim().length > 0 ? Number(value) : Number.NaN;
}

function isInvalidNonNegativeNumber(value: number) {
  return !Number.isFinite(value) || value < 0;
}

export function ParcelamentoInstallmentForm({
  mode,
  installment,
  selectedClient,
  canEdit,
  isSubmitting,
  onCancel,
  onCreate,
  onUpdate,
}: ParcelamentoInstallmentFormProps) {
  const isEditing = mode === "edit";
  const initialFormState = useMemo(() => buildFormState(installment), [installment]);
  const [formState, setFormState] = useState<ParcelamentoInstallmentFormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const isDisabled = !canEdit || isSubmitting || (!isEditing && !selectedClient);

  useEffect(() => {
    setFormState(initialFormState);
    setFormError(null);
  }, [initialFormState]);

  function handleFieldChange<Key extends keyof ParcelamentoInstallmentFormState>(
    field: Key,
    value: ParcelamentoInstallmentFormState[Key],
  ) {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
    setFormError(null);
  }

  function buildCreatePayload(): CreateParcelamentoInstallmentPayload | null {
    if (!selectedClient) {
      setFormError("Selecione um cliente para criar o parcelamento.");
      return null;
    }

    const missingFields = getMissingRequiredFields(formState);
    if (missingFields.length > 0) {
      setFormError(`Preencha os campos obrigatórios: ${missingFields.join(", ")}.`);
      return null;
    }

    const totalAmount = readRequiredNumber(formState.consolidated_total_amount);
    const firstAmount = readRequiredNumber(formState.first_installment_amount);
    const currentAmount = readRequiredNumber(formState.current_month_installment_amount);
    const installmentsCount = Math.trunc(readRequiredNumber(formState.agreed_installments_count));


    if (
      isInvalidNonNegativeNumber(totalAmount) ||
      isInvalidNonNegativeNumber(firstAmount) ||
      isInvalidNonNegativeNumber(currentAmount) ||
      installmentsCount < 1
    ) {
      setFormError("Valores não podem ser negativos e a quantidade de parcelas deve ser ao menos 1.");
      return null;
    }

    return {
      client_id: selectedClient.id,
      agreement_number: formState.agreement_number,
      type: formState.type.trim(),
      legal_nature: formState.legal_nature.trim(),
      jurisdiction: formState.jurisdiction.trim(),
      is_automatic_debit: formState.is_automatic_debit,
      consolidated_total_amount: totalAmount,
      first_installment_amount: firstAmount,
      current_month_installment_amount: currentAmount,
      agreed_installments_count: installmentsCount,
      enrollment_date: formState.enrollment_date,
    };
  }

  function buildUpdatePayload(): PatchParcelamentoInstallmentPayload | null {
    const missingFields = getMissingRequiredFields(formState);
    if (missingFields.length > 0) {
      setFormError(`Preencha os campos obrigatórios: ${missingFields.join(", ")}.`);
      return null;
    }

    const patch: PatchParcelamentoInstallmentPayload = {};

    if (formState.agreement_number !== initialFormState.agreement_number) {
      patch.agreement_number = formState.agreement_number;
    }

    if (formState.type !== initialFormState.type) {
      patch.type = formState.type.trim();
    }

    if (formState.legal_nature !== initialFormState.legal_nature) {
      patch.legal_nature = formState.legal_nature.trim();
    }

    if (formState.jurisdiction !== initialFormState.jurisdiction) {
      patch.jurisdiction = formState.jurisdiction.trim();
    }

    if (formState.is_automatic_debit !== initialFormState.is_automatic_debit) {
      patch.is_automatic_debit = formState.is_automatic_debit;
    }

    if (formState.consolidated_total_amount !== initialFormState.consolidated_total_amount) {
      patch.consolidated_total_amount = readChangedNumber(formState.consolidated_total_amount);
    }

    if (formState.first_installment_amount !== initialFormState.first_installment_amount) {
      patch.first_installment_amount = readChangedNumber(formState.first_installment_amount);
    }

    if (
      formState.current_month_installment_amount !==
      initialFormState.current_month_installment_amount
    ) {
      patch.current_month_installment_amount = readChangedNumber(
        formState.current_month_installment_amount,
      );
    }

    if (formState.agreed_installments_count !== initialFormState.agreed_installments_count) {
      patch.agreed_installments_count = Math.trunc(
        readChangedNumber(formState.agreed_installments_count),
      );
    }

    if (formState.enrollment_date !== initialFormState.enrollment_date) {
      patch.enrollment_date = formState.enrollment_date;
    }

    if (formState.status !== initialFormState.status) {
      patch.status = formState.status;
    }

    if (formState.document_url !== initialFormState.document_url) {
      patch.document_url = formState.document_url;
    }

    if (formState.situation_shutdown !== initialFormState.situation_shutdown) {
      patch.situation_shutdown = formState.situation_shutdown;
    }

    if (formState.completion_date !== initialFormState.completion_date) {
      patch.completion_date = formState.completion_date;
    }

    const numericValues = [
      patch.consolidated_total_amount,
      patch.first_installment_amount,
      patch.current_month_installment_amount,
      patch.agreed_installments_count,
    ];

    if (
      numericValues.some(
        (value) => typeof value === "number" && (!Number.isFinite(value) || value < 0),
      ) ||
      (typeof patch.agreed_installments_count === "number" &&
        patch.agreed_installments_count < 1)
    ) {
      setFormError("Valores não podem ser negativos e a quantidade de parcelas deve ser ao menos 1.");
      return null;
    }

    try {
      return buildPatchInstallmentPayload(patch);
    } catch {
      setFormError("Altere ao menos um campo para salvar.");
      return null;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    const payload = isEditing ? buildUpdatePayload() : buildCreatePayload();

    if (!payload) {
      return;
    }

    try {
      setFormError(null);

      if (isEditing) {
        await onUpdate(payload);
      } else {
        await onCreate(payload as CreateParcelamentoInstallmentPayload);
      }
    } catch (error) {
      setFormError(getParcelamentoErrorMessage(error, "Não foi possível salvar o parcelamento."));
    }
  }

  return (
    // noValidate: a validação é nossa, em português, em vez da nativa do navegador (#1349).
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {selectedClient?.name ?? "Selecione um cliente antes de criar."}
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField
          label="Número do acordo"
          value={formState.agreement_number}
          onChange={(value) => handleFieldChange("agreement_number", value)}
          disabled={isDisabled}
        />
        <SelectField
          label="Tipo"
          options={INSTALLMENT_TYPE_OPTIONS}
          value={formState.type}
          onChange={(value) => handleFieldChange("type", value)}
          disabled={isDisabled}
        />
        <TextField
          label="Natureza jurídica"
          value={formState.legal_nature}
          onChange={(value) => handleFieldChange("legal_nature", value)}
          disabled={isDisabled}
          required
        />
        <SelectField
          label="Jurisdição"
          options={INSTALLMENT_JURISDICTION_OPTIONS}
          value={formState.jurisdiction}
          onChange={(value) => handleFieldChange("jurisdiction", value)}
          disabled={isDisabled}
        />
        <TextField
          label="Valor total do parcelamento"
          type="number"
          min="0"
          step="0.01"
          value={formState.consolidated_total_amount}
          onChange={(value) => handleFieldChange("consolidated_total_amount", value)}
          disabled={isDisabled}
          required
        />
        <TextField
          label="Valor da 1ª parcela"
          type="number"
          min="0"
          step="0.01"
          value={formState.first_installment_amount}
          onChange={(value) => handleFieldChange("first_installment_amount", value)}
          disabled={isDisabled}
          required
        />
        <TextField
          label="Valor da parcela atual"
          type="number"
          min="0"
          step="0.01"
          value={formState.current_month_installment_amount}
          onChange={(value) => handleFieldChange("current_month_installment_amount", value)}
          disabled={isDisabled}
          required
        />
        <TextField
          label="Quantidade de parcelas"
          type="number"
          min="1"
          step="1"
          value={formState.agreed_installments_count}
          onChange={(value) => handleFieldChange("agreed_installments_count", value)}
          disabled={isDisabled}
          required
        />
        <TextField
          label="Data de adesão"
          type="date"
          value={formState.enrollment_date}
          onChange={(value) => handleFieldChange("enrollment_date", value)}
          disabled={isDisabled}
        />

        {isEditing ? (
          <>
            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
              Status
              <ParcelamentoNativeSelect
                value={formState.status}
                onChange={(event) => handleFieldChange("status", event.target.value)}
                disabled={isDisabled}
              >
                {INSTALLMENT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </ParcelamentoNativeSelect>
            </label>
            <TextField
              label="URL do documento"
              type="url"
              value={formState.document_url}
              onChange={(value) => handleFieldChange("document_url", value)}
              disabled={isDisabled}
            />
            <TextField
              label="Situação de encerramento"
              value={formState.situation_shutdown}
              onChange={(value) => handleFieldChange("situation_shutdown", value)}
              disabled={isDisabled}
            />
            <TextField
              label="Data de conclusão"
              type="date"
              value={formState.completion_date}
              onChange={(value) => handleFieldChange("completion_date", value)}
              disabled={isDisabled}
            />
          </>
        ) : null}
      </div>

      <label className={`${parcelamentoCheckboxCardClassName} w-fit`}>
        <input
          type="checkbox"
          checked={formState.is_automatic_debit}
          onChange={(event) => handleFieldChange("is_automatic_debit", event.target.checked)}
          disabled={isDisabled}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Débito automático
      </label>

      {formError ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className={parcelamentoSecondaryButtonClassName}>
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <button type="submit" disabled={isDisabled} className={parcelamentoPrimaryButtonClassName}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isEditing ? "Salvar alterações" : "Criar parcelamento"}
        </button>
      </div>
    </form>
  );
}

function FieldLabel({ label, required }: { label: string; required: boolean }) {
  return (
    <span>
      {label}
      {required ? (
        <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
      ) : null}
    </span>
  );
}

function SelectField({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  // Valor legado fora da lista continua selecionável na edição.
  const choices = value && !options.includes(value) ? [...options, value] : options;

  return (
    <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
      <FieldLabel label={label} required />
      <ParcelamentoNativeSelect
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-required="true"
      >
        <option value="">Selecione</option>
        {choices.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </ParcelamentoNativeSelect>
    </label>
  );
}

function TextField({
  disabled,
  label,
  min,
  onChange,
  required = false,
  step,
  type = "text",
  value,
}: {
  disabled: boolean;
  label: string;
  min?: string;
  onChange: (value: string) => void;
  required?: boolean;
  step?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
      <FieldLabel label={label} required={required} />
      <input
        type={type}
        min={min}
        step={step}
        aria-required={required || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={parcelamentoTextFieldClassName}
      />
    </label>
  );
}
