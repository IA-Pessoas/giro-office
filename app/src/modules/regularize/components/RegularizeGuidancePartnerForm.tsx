import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";
import { formatCpfInput, normalizeDigits } from "@shared/utils/inputFormatting";

import type { AddRegularizeGuidancePartnerPayload, RegularizeId } from "../types";
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
  share: string;
};

const DEFAULT_GUIDANCE_PARTNER_FORM_STATE: RegularizeGuidancePartnerFormState = {
  name: "",
  cpf: "",
  role: "",
  share: "",
};

export function RegularizeGuidancePartnerForm({
  guidanceId,
  isSubmitting,
  onClose,
  onSubmit,
  open,
  processId,
}: {
  guidanceId?: RegularizeId;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: AddRegularizeGuidancePartnerPayload) => Promise<void>;
  open: boolean;
  processId?: RegularizeId;
}) {
  const [formState, setFormState] = useState<RegularizeGuidancePartnerFormState>(
    DEFAULT_GUIDANCE_PARTNER_FORM_STATE,
  );
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFormState(DEFAULT_GUIDANCE_PARTNER_FORM_STATE);
      setFormError(null);
    }
  }, [open]);

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
      await onSubmit({
        guidance_id: guidanceId,
        process_id: processId,
        partner: {
          name: trimRegularizeText(formState.name),
          cpf: normalizeDigits(trimRegularizeText(formState.cpf)),
          role: trimRegularizeOptionalText(formState.role),
          share: toRegularizeOptionalNumber(formState.share),
        },
      });
    } catch (error) {
      setFormError(getRegularizeMutationErrorMessage(error, "Não foi possível adicionar o sócio."));
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
      title="Adicionar sócio"
      description="Adicionar sócio na orientação procedural."
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

          <RegularizeFormField label="Participação">
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.share}
              onChange={(event) => handleChange("share", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>
        </div>

        <RegularizeFormActions
          isSubmitting={isSubmitting}
          onCancel={onClose}
          submitLabel="Adicionar sócio"
          submittingLabel="Adicionando..."
        />
      </form>
    </Dialog>
  );
}
