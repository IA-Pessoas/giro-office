import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";
import { ClientSelectionField } from "@modules/clients";

import type {
  CreateRegularizePartnerPayload,
  RegularizePartner,
  UpdateRegularizePartnerPayload,
} from "../types";
import {
  getRegularizeMutationErrorMessage,
  toRegularizeInputDate,
  trimRegularizeOptionalText,
} from "../utils/regularizeForm";
import { type PartnerFormErrors, validatePartnerForm } from "../utils/partnerForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import { RegularizeClientPfSelect } from "./RegularizeClientPfSelect";

type RegularizePartnerFormState = {
  pj_id: string;
  pf_id: string;
  part: string;
  entry: string;
  exit: string;
};

const DEFAULT_PARTNER_FORM_STATE: RegularizePartnerFormState = {
  pj_id: "",
  pf_id: "",
  part: "",
  entry: "",
  exit: "",
};

function buildPartnerFormState(
  partner: RegularizePartner | null,
  defaultPfId: string,
  defaultPjId: string,
): RegularizePartnerFormState {
  if (!partner) {
    return {
      ...DEFAULT_PARTNER_FORM_STATE,
      pf_id: defaultPfId,
      pj_id: defaultPjId,
    };
  }

  return {
    pj_id: partner.pj_id,
    pf_id: partner.pf_id,
    part: partner.part === null || partner.part === undefined ? "" : String(partner.part),
    entry: toRegularizeInputDate(partner.entry),
    exit: toRegularizeInputDate(partner.exit),
  };
}

export function RegularizePartnerForm({
  defaultPfId,
  defaultPjId,
  excludePfIds,
  isSubmitting,
  onClose,
  onSubmit,
  open,
  partner,
}: {
  defaultPfId: string;
  defaultPjId: string;
  excludePfIds?: readonly string[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizePartnerPayload | UpdateRegularizePartnerPayload,
  ) => Promise<void>;
  open: boolean;
  partner: RegularizePartner | null;
}) {
  const [formState, setFormState] = useState<RegularizePartnerFormState>(
    buildPartnerFormState(partner, defaultPfId, defaultPjId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PartnerFormErrors>({});

  const isEditing = Boolean(partner);

  useEffect(() => {
    if (open) {
      setFormState(buildPartnerFormState(partner, defaultPfId, defaultPjId));
      setFormError(null);
      setFieldErrors({});
    }
  }, [defaultPfId, defaultPjId, open, partner]);

  function handleChange<K extends keyof RegularizePartnerFormState>(
    key: K,
    value: RegularizePartnerFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const dateInput = (name: string) =>
      event.currentTarget.elements.namedItem(name) as HTMLInputElement | null;
    const errors = validatePartnerForm(formState, {
      entryIncomplete: dateInput("entry")?.validity.badInput,
      exitIncomplete: dateInput("exit")?.validity.badInput,
    });
    setFieldErrors(errors);

    if (!formState.pj_id || Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      pj_id: formState.pj_id,
      pf_id: formState.pf_id,
      part: Number(formState.part),
      entry: formState.entry,
      exit: trimRegularizeOptionalText(formState.exit),
    };

    try {
      if (partner) {
        await onSubmit({
          ...payload,
          id: partner.id,
        });
      } else {
        await onSubmit(payload);
      }
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
      title={isEditing ? "Editar sócio" : "Novo sócio"}
      description="Formulário de sócio do Regularize."
      contentClassName="w-[min(92vw,760px)]"
      bodyClassName="max-h-[72vh] overflow-y-auto"
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        <RegularizeFormError message={formError} title="Não foi possível salvar o vínculo" />

        <div className="grid gap-5 md:grid-cols-2">
          <RegularizeFormField label="Cliente PJ" required>
            <ClientSelectionField clientId={formState.pj_id} />
          </RegularizeFormField>

          <fieldset className="flex min-w-0 flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            <legend className="inline-flex items-center gap-1">
              <span>Cliente PF</span>
              <span className="text-red-500">*</span>
            </legend>
            <RegularizeClientPfSelect
              excludeIds={excludePfIds}
              value={formState.pf_id}
              onChange={(id) => handleChange("pf_id", id)}
            />
            {fieldErrors.pf_id ? (
              <span role="alert" className="text-xs text-red-700 dark:text-red-300">
                {fieldErrors.pf_id}
              </span>
            ) : null}
          </fieldset>

          <RegularizeFormField label="Participação (%)" required error={fieldErrors.part}>
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={formState.part}
              onChange={(event) => handleChange("part", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Entrada" required error={fieldErrors.entry}>
            <input
              name="entry"
              type="date"
              value={formState.entry}
              onChange={(event) => handleChange("entry", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Saída" error={fieldErrors.exit}>
            <input
              name="exit"
              type="date"
              value={formState.exit}
              onChange={(event) => handleChange("exit", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>
        </div>

        <RegularizeFormActions
          isSubmitting={isSubmitting}
          onCancel={onClose}
          submitLabel={isEditing ? "Salvar alterações" : "Criar sócio"}
        />
      </form>
    </Dialog>
  );
}
