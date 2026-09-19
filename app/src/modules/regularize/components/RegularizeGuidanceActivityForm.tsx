import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";

import type {
  AddRegularizeGuidanceActivityPayload,
  RegularizeGuidanceEconomicActivity,
  RegularizeId,
  UpdateRegularizeGuidanceActivityPayload,
} from "../types";
import { getRegularizeMutationErrorMessage, trimRegularizeText } from "../utils/regularizeForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

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
  activity,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
  open,
  processId,
}: {
  activity?: RegularizeGuidanceEconomicActivity | null;
  guidanceId?: RegularizeId;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (
    payload: AddRegularizeGuidanceActivityPayload | UpdateRegularizeGuidanceActivityPayload,
  ) => Promise<void>;
  open: boolean;
  mode: "create" | "edit";
  processId?: RegularizeId;
}) {
  const [formState, setFormState] =
    useState<RegularizeGuidanceActivityFormState>(DEFAULT_ACTIVITY_FORM_STATE);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFormState(
        activity
          ? {
              code: activity.code ?? "",
              description: activity.description ?? "",
              type: activity.type === "Principal" ? "Principal" : "Secundária",
            }
          : DEFAULT_ACTIVITY_FORM_STATE,
      );
      setFormError(null);
    }
  }, [activity, open]);

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
      const payload = {
        guidance_id: guidanceId,
        process_id: processId,
        activity: {
          ...(activity?.id ? { id: activity.id } : {}),
          code: trimRegularizeText(formState.code),
          description: trimRegularizeText(formState.description),
          type: formState.type,
        },
      };
      await onSubmit(
        mode === "edit" && activity?.id
          ? (payload as UpdateRegularizeGuidanceActivityPayload)
          : payload,
      );
    } catch (error) {
      setFormError(
        getRegularizeMutationErrorMessage(error, "Não foi possível salvar a atividade."),
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
      title={mode === "edit" ? "Editar atividade" : "Adicionar atividade"}
      description="Atividade econômica da orientação procedural."
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
            <RegularizeNativeSelect
              value={formState.type}
              onChange={(event) => handleChange("type", event.target.value)}
            >
              <option value="Principal">Principal</option>
              <option value="Secundária">Secundária</option>
            </RegularizeNativeSelect>
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
          submitLabel={mode === "edit" ? "Salvar atividade" : "Adicionar atividade"}
          submittingLabel={mode === "edit" ? "Salvando..." : "Adicionando..."}
        />
      </form>
    </Dialog>
  );
}
