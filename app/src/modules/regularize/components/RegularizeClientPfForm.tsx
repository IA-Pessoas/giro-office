import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";
import { formatCpfInput, normalizeDigits } from "@shared/utils/inputFormatting";

import type {
  CreateRegularizeClientPfPayload,
  RegularizeClientPfDetail,
  UpdateRegularizeClientPfPayload,
} from "../types";
import {
  getRegularizeMutationErrorMessage,
  toRegularizeInputDate,
  trimRegularizeOptionalText,
  trimRegularizeText,
} from "../utils/regularizeForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  getRegularizePresetOptions,
  regularizeClientStatusOptions,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

type RegularizeClientPfFormState = {
  code: string;
  name: string;
  sex: string;
  address: string;
  city: string;
  zip_code: string;
  state: string;
  profession: string;
  father: string;
  mother: string;
  marital_status: string;
  date_of_birth: string;
  cpf: string;
  rg: string;
  rg_expedition: string;
  rg_validity: string;
  military_certificate: string;
  ctps: string;
  cnh: string;
  cnh_expedition: string;
  cnh_validity: string;
  spouse: string;
  notes: string;
  status: string;
};

const DEFAULT_CLIENT_PF_FORM_STATE: RegularizeClientPfFormState = {
  code: "",
  name: "",
  sex: "",
  address: "",
  city: "",
  zip_code: "",
  state: "",
  profession: "",
  father: "",
  mother: "",
  marital_status: "",
  date_of_birth: "",
  cpf: "",
  rg: "",
  rg_expedition: "",
  rg_validity: "",
  military_certificate: "",
  ctps: "",
  cnh: "",
  cnh_expedition: "",
  cnh_validity: "",
  spouse: "",
  notes: "",
  status: "Ativo",
};

const REQUIRED_CLIENT_PF_FIELDS: Array<keyof RegularizeClientPfFormState> = [
  "code",
  "name",
  "sex",
  "address",
  "city",
  "zip_code",
  "state",
  "profession",
  "father",
  "mother",
  "marital_status",
  "date_of_birth",
  "cpf",
  "rg",
  "status",
];

function buildClientPfFormState(
  clientPf: RegularizeClientPfDetail | null,
): RegularizeClientPfFormState {
  if (!clientPf) {
    return DEFAULT_CLIENT_PF_FORM_STATE;
  }

  return {
    code: clientPf.code ?? "",
    name: clientPf.name ?? "",
    sex: clientPf.sex ?? "",
    address: clientPf.address ?? "",
    city: clientPf.city ?? "",
    zip_code: clientPf.zip_code ?? "",
    state: clientPf.state ?? "",
    profession: clientPf.profession ?? "",
    father: clientPf.father ?? "",
    mother: clientPf.mother ?? "",
    marital_status: clientPf.marital_status ?? "",
    date_of_birth: toRegularizeInputDate(clientPf.date_of_birth),
    cpf: formatCpfInput(clientPf.cpf ?? ""),
    rg: clientPf.rg ?? "",
    rg_expedition: toRegularizeInputDate(clientPf.rg_expedition),
    rg_validity: toRegularizeInputDate(clientPf.rg_validity),
    military_certificate: clientPf.military_certificate ?? "",
    ctps: clientPf.ctps ?? "",
    cnh: clientPf.cnh ?? "",
    cnh_expedition: toRegularizeInputDate(clientPf.cnh_expedition),
    cnh_validity: toRegularizeInputDate(clientPf.cnh_validity),
    spouse: clientPf.spouse ?? "",
    notes: clientPf.notes ?? "",
    status: clientPf.status ?? "Ativo",
  };
}

function buildClientPfPayload(
  formState: RegularizeClientPfFormState,
): CreateRegularizeClientPfPayload {
  return {
    code: trimRegularizeText(formState.code),
    name: trimRegularizeText(formState.name),
    sex: trimRegularizeText(formState.sex),
    address: trimRegularizeText(formState.address),
    city: trimRegularizeText(formState.city),
    zip_code: trimRegularizeText(formState.zip_code),
    state: trimRegularizeText(formState.state),
    profession: trimRegularizeText(formState.profession),
    father: trimRegularizeText(formState.father),
    mother: trimRegularizeText(formState.mother),
    marital_status: trimRegularizeText(formState.marital_status),
    date_of_birth: formState.date_of_birth,
    cpf: normalizeDigits(trimRegularizeText(formState.cpf)),
    rg: trimRegularizeText(formState.rg),
    rg_expedition: trimRegularizeOptionalText(formState.rg_expedition),
    rg_validity: trimRegularizeOptionalText(formState.rg_validity),
    military_certificate: trimRegularizeOptionalText(formState.military_certificate),
    ctps: trimRegularizeOptionalText(formState.ctps),
    cnh: trimRegularizeOptionalText(formState.cnh),
    cnh_expedition: trimRegularizeOptionalText(formState.cnh_expedition),
    cnh_validity: trimRegularizeOptionalText(formState.cnh_validity),
    spouse: trimRegularizeOptionalText(formState.spouse),
    notes: trimRegularizeOptionalText(formState.notes),
    status: trimRegularizeText(formState.status),
  };
}

export function RegularizeClientPfForm({
  clientPf,
  isLoadingInitialValue = false,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
  open,
}: {
  clientPf: RegularizeClientPfDetail | null;
  isLoadingInitialValue?: boolean;
  isSubmitting: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizeClientPfPayload | UpdateRegularizeClientPfPayload,
  ) => Promise<void>;
  open: boolean;
}) {
  const [formState, setFormState] = useState<RegularizeClientPfFormState>(
    buildClientPfFormState(clientPf),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = mode === "edit";

  useEffect(() => {
    if (open) {
      setFormState(buildClientPfFormState(clientPf));
      setFormError(null);
    }
  }, [clientPf, open]);

  function handleChange<K extends keyof RegularizeClientPfFormState>(
    key: K,
    value: RegularizeClientPfFormState[K],
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

    if (isEditing && !clientPf) {
      setFormError("Não foi possível carregar os dados do cliente PF.");
      return;
    }

    const missingRequiredField = REQUIRED_CLIENT_PF_FIELDS.some(
      (fieldName) => !formState[fieldName].trim(),
    );

    if (missingRequiredField) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    try {
      const payload = buildClientPfPayload(formState);

      if (isEditing && clientPf) {
        await onSubmit({
          ...payload,
          id: clientPf.id,
        });
      } else {
        await onSubmit(payload);
      }
    } catch (error) {
      setFormError(getRegularizeMutationErrorMessage(error, "Não foi possível salvar o cliente PF."));
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
      title={isEditing ? "Editar cliente PF" : "Novo cliente PF"}
      description="Formulário de cliente PF do Regularize."
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
            <RegularizeFormField label="Código" required>
              <input
                value={formState.code}
                onChange={(event) => handleChange("code", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Nome" required className="md:col-span-2">
              <input
                value={formState.name}
                onChange={(event) => handleChange("name", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="CPF" required>
              <input
                value={formState.cpf}
                onChange={(event) => handleChange("cpf", formatCpfInput(event.target.value))}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="RG" required>
              <input
                value={formState.rg}
                onChange={(event) => handleChange("rg", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Nascimento" required>
              <input
                type="date"
                value={formState.date_of_birth}
                onChange={(event) => handleChange("date_of_birth", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Sexo" required>
              <input
                value={formState.sex}
                onChange={(event) => handleChange("sex", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Estado civil" required>
              <input
                value={formState.marital_status}
                onChange={(event) => handleChange("marital_status", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Profissão" required>
              <input
                value={formState.profession}
                onChange={(event) => handleChange("profession", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Endereço" required className="md:col-span-2">
              <input
                value={formState.address}
                onChange={(event) => handleChange("address", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="CEP" required>
              <input
                value={formState.zip_code}
                onChange={(event) => handleChange("zip_code", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Cidade" required>
              <input
                value={formState.city}
                onChange={(event) => handleChange("city", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="UF" required>
              <input
                value={formState.state}
                onChange={(event) => handleChange("state", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Status" required>
              <RegularizeNativeSelect
                value={formState.status}
                onChange={(event) => handleChange("status", event.target.value)}
              >
                {getRegularizePresetOptions(regularizeClientStatusOptions, formState.status).map(
                  (status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ),
                )}
              </RegularizeNativeSelect>
            </RegularizeFormField>

            <RegularizeFormField label="Pai" required>
              <input
                value={formState.father}
                onChange={(event) => handleChange("father", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Mãe" required>
              <input
                value={formState.mother}
                onChange={(event) => handleChange("mother", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Cônjuge">
              <input
                value={formState.spouse}
                onChange={(event) => handleChange("spouse", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Expedição RG">
              <input
                type="date"
                value={formState.rg_expedition}
                onChange={(event) => handleChange("rg_expedition", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Validade RG">
              <input
                type="date"
                value={formState.rg_validity}
                onChange={(event) => handleChange("rg_validity", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Certificado militar">
              <input
                value={formState.military_certificate}
                onChange={(event) => handleChange("military_certificate", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="CTPS">
              <input
                value={formState.ctps}
                onChange={(event) => handleChange("ctps", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="CNH">
              <input
                value={formState.cnh}
                onChange={(event) => handleChange("cnh", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Expedição CNH">
              <input
                type="date"
                value={formState.cnh_expedition}
                onChange={(event) => handleChange("cnh_expedition", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Validade CNH">
              <input
                type="date"
                value={formState.cnh_validity}
                onChange={(event) => handleChange("cnh_validity", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Observações" className="md:col-span-3">
              <textarea
                value={formState.notes}
                onChange={(event) => handleChange("notes", event.target.value)}
                className={regularizeTextareaClassName}
              />
            </RegularizeFormField>
          </div>

          <RegularizeFormActions
            isSubmitting={isSubmitting}
            onCancel={onClose}
            submitLabel={isEditing ? "Salvar alterações" : "Criar cliente PF"}
          />
        </form>
      )}
    </Dialog>
  );
}
