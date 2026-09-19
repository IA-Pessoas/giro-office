import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";
import { formatCpfInput, normalizeDigits } from "@shared/utils/inputFormatting";

import type {
  AddRegularizeGuidancePartnerPayload,
  RegularizeGuidancePartner,
  RegularizeId,
  UpdateRegularizeGuidancePartnerPayload,
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
  regularizeTextFieldClassName,
} from "./regularizeFormControls";

type RegularizeGuidancePartnerFormState = {
  name: string;
  cpf: string;
  role: string;
  percentage: string;
  profession: string;
  marital_status: string;
  rg: string;
  cnh: string;
  address: string;
};

const DEFAULT_GUIDANCE_PARTNER_FORM_STATE: RegularizeGuidancePartnerFormState = {
  name: "",
  cpf: "",
  role: "",
  percentage: "",
  profession: "",
  marital_status: "",
  rg: "",
  cnh: "",
  address: "",
};

export function RegularizeGuidancePartnerForm({
  guidanceId,
  partner,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
  open,
  processId,
}: {
  mode: "create" | "edit";
  guidanceId?: RegularizeId;
  partner?: RegularizeGuidancePartner | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (
    payload: AddRegularizeGuidancePartnerPayload | UpdateRegularizeGuidancePartnerPayload,
  ) => Promise<void>;
  open: boolean;
  processId?: RegularizeId;
}) {
  const [formState, setFormState] = useState<RegularizeGuidancePartnerFormState>(
    DEFAULT_GUIDANCE_PARTNER_FORM_STATE,
  );
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFormState(
        partner
          ? {
              name: partner.name ?? "",
              cpf: partner.cpf ?? "",
              role: partner.role ?? "",
              percentage: String(partner.percentage ?? partner.share ?? ""),
              profession: partner.profession ?? "",
              marital_status: partner.marital_status ?? "",
              rg: partner.rg ?? "",
              cnh: partner.cnh ?? "",
              address: partner.address ?? "",
            }
          : DEFAULT_GUIDANCE_PARTNER_FORM_STATE,
      );
      setFormError(null);
    }
  }, [open, partner]);

  function handleChange<K extends keyof RegularizeGuidancePartnerFormState>(
    key: K,
    value: RegularizeGuidancePartnerFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!guidanceId || !formState.name.trim() || !formState.cpf.trim()) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    try {
      const percentage = toRegularizeOptionalNumber(formState.percentage);
      const payload = {
        guidance_id: guidanceId,
        process_id: processId,
        partner: {
          ...(partner?.id ? { id: partner.id } : {}),
          name: trimRegularizeText(formState.name),
          cpf: normalizeDigits(trimRegularizeText(formState.cpf)),
          role: trimRegularizeOptionalText(formState.role),
          percentage,
          share: percentage,
          profession: trimRegularizeOptionalText(formState.profession),
          marital_status: trimRegularizeOptionalText(formState.marital_status),
          rg: trimRegularizeOptionalText(formState.rg),
          cnh: trimRegularizeOptionalText(formState.cnh),
          address: trimRegularizeOptionalText(formState.address),
        },
      };
      await onSubmit(
        mode === "edit" && partner?.id
          ? (payload as UpdateRegularizeGuidancePartnerPayload)
          : payload,
      );
    } catch (error) {
      setFormError(getRegularizeMutationErrorMessage(error, "Não foi possível salvar o sócio."));
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
      title={mode === "edit" ? "Editar sócio" : "Adicionar sócio"}
      description="Snapshot do sócio na orientação procedural."
      contentClassName="w-[min(92vw,680px)]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <RegularizeFormError message={formError} />

        <div className="grid gap-4 md:grid-cols-2">
          <RegularizeFormField label="Nome" required>
            <input
              value={formState.name}
              onChange={(event) => handleChange("name", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="CPF" required>
            <input
              value={formState.cpf}
              onChange={(event) =>
                handleChange("cpf", formatCpfInput(event.target.value))
              }
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Função">
            <input
              value={formState.role}
              onChange={(event) => handleChange("role", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Percentual">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formState.percentage}
              onChange={(event) => handleChange("percentage", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Profissão">
            <input
              value={formState.profession}
              onChange={(event) => handleChange("profession", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Estado civil">
            <input
              value={formState.marital_status}
              onChange={(event) => handleChange("marital_status", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="RG">
            <input
              value={formState.rg}
              onChange={(event) => handleChange("rg", event.target.value)}
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

          <RegularizeFormField label="Endereço" className="md:col-span-2">
            <input
              value={formState.address}
              onChange={(event) => handleChange("address", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>
        </div>

        <RegularizeFormActions
          isSubmitting={isSubmitting}
          onCancel={onClose}
          submitLabel={mode === "edit" ? "Salvar sócio" : "Adicionar sócio"}
          submittingLabel={mode === "edit" ? "Salvando..." : "Adicionando..."}
        />
      </form>
    </Dialog>
  );
}
