import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";

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
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  type RegularizeFormOption,
  regularizeSelectClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";

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
  clientOptions,
  defaultPfId,
  isSubmitting,
  onClose,
  onSubmit,
  open,
  partner,
  pfOptions,
}: {
  clientOptions: RegularizeFormOption[];
  defaultPfId: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizePartnerPayload | UpdateRegularizePartnerPayload,
  ) => Promise<void>;
  open: boolean;
  partner: RegularizePartner | null;
  pfOptions: RegularizeFormOption[];
}) {
  const defaultPjId = clientOptions[0]?.id ?? "";
  const [formState, setFormState] = useState<RegularizePartnerFormState>(
    buildPartnerFormState(partner, defaultPfId, defaultPjId),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(partner);

  useEffect(() => {
    if (open) {
      setFormState(buildPartnerFormState(partner, defaultPfId, defaultPjId));
      setFormError(null);
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

    const part = Number(formState.part);

    if (
      !formState.pj_id ||
      !formState.pf_id ||
      !formState.part.trim() ||
      !formState.entry ||
      Number.isNaN(part)
    ) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    const payload = {
      pj_id: formState.pj_id,
      pf_id: formState.pf_id,
      part,
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <RegularizeFormError message={formError} />

        <div className="grid gap-4 md:grid-cols-2">
          <RegularizeFormField label="Cliente PJ" required>
            <select
              value={formState.pj_id}
              onChange={(event) => handleChange("pj_id", event.target.value)}
              className={regularizeSelectClassName}
            >
              <option value="">Selecione</option>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                  {client.description ? `, ${client.description}` : ""}
                </option>
              ))}
            </select>
          </RegularizeFormField>

          <RegularizeFormField label="Cliente PF" required>
            <select
              value={formState.pf_id}
              onChange={(event) => handleChange("pf_id", event.target.value)}
              className={regularizeSelectClassName}
            >
              <option value="">Selecione</option>
              {pfOptions.map((clientPf) => (
                <option key={clientPf.id} value={clientPf.id}>
                  {clientPf.label}
                  {clientPf.description ? `, ${clientPf.description}` : ""}
                </option>
              ))}
            </select>
          </RegularizeFormField>

          <RegularizeFormField label="Participação" required>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.part}
              onChange={(event) => handleChange("part", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Entrada" required>
            <input
              type="date"
              value={formState.entry}
              onChange={(event) => handleChange("entry", event.target.value)}
              className={regularizeTextFieldClassName}
            />
          </RegularizeFormField>

          <RegularizeFormField label="Saída">
            <input
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
