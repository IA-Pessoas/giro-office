import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";

import type { AddRegularizeGuidanceActivityPayload, RegularizeId } from "../types";
import { getRegularizeMutationErrorMessage, trimRegularizeText } from "../utils/regularizeForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  regularizeSelectClassName,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";

type RegularizeGuidanceActivityFormState = {
  code: string;
  description: string;
  type: string;
};

const DEFAULT_ACTIVITY_FORM_STATE: RegularizeGuidanceActivityFormState = {
  code: "",
  description: "",
  type: "Principal",
};

export function RegularizeGuidanceActivityForm({
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
  onSubmit: (payload: AddRegularizeGuidanceActivityPayload) => Promise<void>;
  open: boolean;
  processId?: RegularizeId;
}) {
  const [formState, setFormState] =
    useState<RegularizeGuidanceActivityFormState>(DEFAULT_ACTIVITY_FORM_STATE);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFormState(DEFAULT_ACTIVITY_FORM_STATE);
      setFormError(null);
    }
  }, [open]);

  function handleChange<K extends keyof RegularizeGuidanceActivityFormState>(
    key: K,
    value: RegularizeGuidanceActivityFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!guidanceId || !formState.code.trim() || !formState.description.trim() || !formState.type) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    try {
      await onSubmit({
        guidance_id: guidanceId,
        process_id: processId,
        activity: {
          code: trimRegularizeText(formState.code),
          description: trimRegularizeText(formState.description),
          type: formState.type,
        },
      });
    } catch (error) {
      setFormError(
        getRegularizeMutationErrorMessage(error, "Não foi possível adicionar a atividade."),
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
      title="Adicionar atividade"
      description="Adicionar atividade econômica na orientação procedural."
      contentClassName="w-[min(92vw,680px)]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <RegularizeFormError message={formError} />

        <div className="grid gap-4 md:grid-cols-2">
          <RegularizeFormField label="Código" required>
            <input
              value={formState.code}
              onChange={(event) => handleChange("code", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Tipo" required>
            <select
              value={formState.type}
              onChange={(event) => handleChange("type", event.target.value)}
              className={regularizeSelectClassName}
            >
              <option value="Principal">Principal</option>
              <option value="Secundária">Secundária</option>
            </select>
          </RegularizeFormField>

          <RegularizeFormField label="Descrição" required className="md:col-span-2">
            <textarea
              value={formState.description}
              onChange={(event) => handleChange("description", event.target.value)}
              className={regularizeTextareaClassName}
            />
          </RegularizeFormField>
        </div>

        <RegularizeFormActions
          isSubmitting={isSubmitting}
          onCancel={onClose}
          submitLabel="Adicionar atividade"
          submittingLabel="Adicionando..."
        />
      </form>
    </Dialog>
  );
}
