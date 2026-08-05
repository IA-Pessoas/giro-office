import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";

import type {
  CreateRegularizeGuidancePayload,
  RegularizeGuidance,
  UpdateRegularizeGuidancePayload,
} from "../types";
import {
  getRegularizeMutationErrorMessage,
  toRegularizeOptionalNumber,
  trimRegularizeOptionalText,
  trimRegularizeText,
} from "../utils/regularizeForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  type RegularizeFormOption,
  getRegularizePresetOptions,
  regularizeGuidanceStatusOptions,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

type RegularizeGuidanceFormState = {
  process_id: string;
  type: string;
  request: string;
  framework_obs: string;
  legal_nature: string;
  company_name: string;
  trade_name: string;
  cpf_cnpj: string;
  share_capital: string;
  iptu: string;
  address: string;
  comporate_purpose: string;
  carryng: string;
  regime: string;
  legal_representative: string;
  status: string;
};

function buildGuidanceFormState(
  guidance: RegularizeGuidance | null,
  defaultProcessId: string,
): RegularizeGuidanceFormState {
  if (!guidance) {
    return {
      process_id: defaultProcessId,
      type: "",
      request: "",
      framework_obs: "",
      legal_nature: "",
      company_name: "",
      trade_name: "",
      cpf_cnpj: "",
      share_capital: "",
      iptu: "",
      address: "",
      comporate_purpose: "",
      carryng: "",
      regime: "",
      legal_representative: "",
      status: "Em andamento",
    };
  }

  return {
    process_id: guidance.process_id,
    type: guidance.type ?? "",
    request: guidance.request ?? "",
    framework_obs: guidance.framework_obs ?? "",
    legal_nature: guidance.legal_nature ?? "",
    company_name: guidance.company_name ?? "",
    trade_name: guidance.trade_name ?? "",
    cpf_cnpj: guidance.cpf_cnpj ?? "",
    share_capital:
      guidance.share_capital === null || guidance.share_capital === undefined
        ? ""
        : String(guidance.share_capital),
    iptu: guidance.iptu ?? "",
    address: guidance.address ?? "",
    comporate_purpose: guidance.comporate_purpose ?? "",
    carryng: guidance.carryng ?? "",
    regime: guidance.regime ?? "",
    legal_representative: guidance.legal_representative ?? "",
    status: guidance.status ?? "Em andamento",
  };
}

function buildGuidancePayload(formState: RegularizeGuidanceFormState) {
  return {
    type: trimRegularizeOptionalText(formState.type),
    request: trimRegularizeOptionalText(formState.request),
    framework_obs: trimRegularizeOptionalText(formState.framework_obs),
    legal_nature: trimRegularizeOptionalText(formState.legal_nature),
    company_name: trimRegularizeOptionalText(formState.company_name),
    trade_name: trimRegularizeOptionalText(formState.trade_name),
    cpf_cnpj: trimRegularizeOptionalText(formState.cpf_cnpj),
    share_capital: toRegularizeOptionalNumber(formState.share_capital),
    iptu: trimRegularizeOptionalText(formState.iptu),
    address: trimRegularizeOptionalText(formState.address),
    comporate_purpose: trimRegularizeOptionalText(formState.comporate_purpose),
    carryng: trimRegularizeOptionalText(formState.carryng),
    regime: trimRegularizeOptionalText(formState.regime),
    legal_representative: trimRegularizeOptionalText(formState.legal_representative),
    status: trimRegularizeText(formState.status),
  };
}

export function RegularizeGuidanceForm({
  defaultProcessId,
  guidance,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
  open,
  processOptions,
}: {
  defaultProcessId: string;
  guidance: RegularizeGuidance | null;
  isSubmitting: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizeGuidancePayload | UpdateRegularizeGuidancePayload,
  ) => Promise<void>;
  open: boolean;
  processOptions: RegularizeFormOption[];
}) {
  const [formState, setFormState] = useState<RegularizeGuidanceFormState>(
    buildGuidanceFormState(guidance, defaultProcessId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = mode === "edit";

  useEffect(() => {
    if (open) {
      setFormState(buildGuidanceFormState(guidance, defaultProcessId));
      setFormError(null);
    }
  }, [defaultProcessId, guidance, open]);

  function handleChange<K extends keyof RegularizeGuidanceFormState>(
    key: K,
    value: RegularizeGuidanceFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!formState.process_id || !formState.status.trim()) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    try {
      const payload = buildGuidancePayload(formState);

      if (isEditing && guidance) {
        await onSubmit({
          ...payload,
          id: guidance.id,
          process_id: guidance.process_id,
        });
      } else {
        await onSubmit({
          ...payload,
          process_id: formState.process_id,
        });
      }
    } catch (error) {
      setFormError(
        getRegularizeMutationErrorMessage(error, "Não foi possível salvar a orientação."),
      );
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
      title={isEditing ? "Editar orientação" : "Nova orientação"}
      description="Formulário de orientação procedural do Regularize."
      contentClassName="w-[min(94vw,920px)]"
      bodyClassName="max-h-[72vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <RegularizeFormError message={formError} />

        <div className="grid gap-4 md:grid-cols-3">
          <RegularizeFormField label="Processo" required className="md:col-span-2">
            <RegularizeNativeSelect
              value={formState.process_id}
              onChange={(event) => handleChange("process_id", event.target.value)}
              disabled={isEditing}
            >
              <option value="">Selecione</option>
              {processOptions.map((process) => (
                <option key={process.id} value={process.id}>
                  {process.label}
                  {process.description ? `, ${process.description}` : ""}
                </option>
              ))}
            </RegularizeNativeSelect>
          </RegularizeFormField>

          <RegularizeFormField label="Status" required>
            <RegularizeNativeSelect
              value={formState.status}
              onChange={(event) => handleChange("status", event.target.value)}
            >
              {getRegularizePresetOptions(regularizeGuidanceStatusOptions, formState.status).map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ),
              )}
            </RegularizeNativeSelect>
          </RegularizeFormField>

          <RegularizeFormField label="Tipo">
            <input
              value={formState.type}
              onChange={(event) => handleChange("type", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Solicitação">
            <input
              value={formState.request}
              onChange={(event) => handleChange("request", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField
            label="Natureza jurídica"
            help="Classificação jurídica da empresa conforme o cadastro oficial."
          >
            <input
              value={formState.legal_nature}
              onChange={(event) => handleChange("legal_nature", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Razão social">
            <input
              value={formState.company_name}
              onChange={(event) => handleChange("company_name", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Nome fantasia">
            <input
              value={formState.trade_name}
              onChange={(event) => handleChange("trade_name", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="CPF/CNPJ">
            <input
              value={formState.cpf_cnpj}
              onChange={(event) => handleChange("cpf_cnpj", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Capital social">
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.share_capital}
              onChange={(event) => handleChange("share_capital", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="IPTU">
            <input
              value={formState.iptu}
              onChange={(event) => handleChange("iptu", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Endereço" className="md:col-span-2">
            <input
              value={formState.address}
              onChange={(event) => handleChange("address", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Regime">
            <input
              value={formState.regime}
              onChange={(event) => handleChange("regime", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Porte">
            <input
              value={formState.carryng}
              onChange={(event) => handleChange("carryng", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Representante legal">
            <input
              value={formState.legal_representative}
              onChange={(event) => handleChange("legal_representative", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Objeto social" className="md:col-span-3">
            <textarea
              value={formState.comporate_purpose}
              onChange={(event) => handleChange("comporate_purpose", event.target.value)}
              className={regularizeTextareaClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Observações de enquadramento" className="md:col-span-3">
            <textarea
              value={formState.framework_obs}
              onChange={(event) => handleChange("framework_obs", event.target.value)}
              className={regularizeTextareaClassName}
            />
          </RegularizeFormField>
        </div>

        <RegularizeFormActions
          isSubmitting={isSubmitting}
          onCancel={onClose}
          submitLabel={isEditing ? "Salvar alterações" : "Criar orientação"}
        />
      </form>
    </Dialog>
  );
}
