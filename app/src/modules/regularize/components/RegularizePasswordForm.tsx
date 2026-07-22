import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";

import type {
  CreateRegularizePasswordPayload,
  RegularizePasswordDetail,
  UpdateRegularizePasswordPayload,
} from "../types";
import {
  getRegularizeMutationErrorMessage,
  trimRegularizeNullableText,
  trimRegularizeText,
} from "../utils/regularizeForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  type RegularizeFormOption,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import { RegularizeClientPickerField } from "./RegularizeClientPickerField";

type RegularizePasswordFormState = {
  client_id: string;
  site_id: string;
  login: string;
  password: string;
  notes: string;
};

const DEFAULT_PASSWORD_FORM_STATE: RegularizePasswordFormState = {
  client_id: "",
  site_id: "",
  login: "",
  password: "",
  notes: "",
};

function buildPasswordFormState(
  password: RegularizePasswordDetail | null,
  defaultClientId: string,
  defaultSiteId: string,
): RegularizePasswordFormState {
  if (!password) {
    return {
      ...DEFAULT_PASSWORD_FORM_STATE,
      client_id: defaultClientId,
      site_id: defaultSiteId,
    };
  }

  return {
    client_id: password.client_id,
    site_id: password.site_id,
    login: password.login ?? "",
    password: password.password ?? "",
    notes: password.notes ?? "",
  };
}

export function RegularizePasswordForm({
  defaultClientId,
  isLoadingInitialValue = false,
  isSubmitting,
  onClose,
  onSubmit,
  open,
  mode,
  password,
  siteOptions,
}: {
  defaultClientId: string;
  isLoadingInitialValue?: boolean;
  isSubmitting: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizePasswordPayload | UpdateRegularizePasswordPayload,
  ) => Promise<void>;
  open: boolean;
  password: RegularizePasswordDetail | null;
  siteOptions: RegularizeFormOption[];
}) {
  const defaultSiteId = siteOptions[0]?.id ?? "";
  const [formState, setFormState] = useState<RegularizePasswordFormState>(
    buildPasswordFormState(password, defaultClientId, defaultSiteId),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = mode === "edit";

  useEffect(() => {
    if (open) {
      setFormState(buildPasswordFormState(password, defaultClientId, defaultSiteId));
      setFormError(null);
    }
  }, [defaultClientId, defaultSiteId, open, password]);

  function handleChange<K extends keyof RegularizePasswordFormState>(
    key: K,
    value: RegularizePasswordFormState[K],
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

    if (isEditing && !password) {
      setFormError("Não foi possível carregar os dados da senha.");
      return;
    }

    if (
      !formState.client_id ||
      !formState.site_id ||
      !formState.login.trim() ||
      !formState.password.trim()
    ) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    const payload = {
      client_id: formState.client_id,
      site_id: formState.site_id,
      login: trimRegularizeText(formState.login),
      password: formState.password,
      notes: trimRegularizeNullableText(formState.notes),
    };

    try {
      if (isEditing && password) {
        await onSubmit({
          ...payload,
          id: password.id,
        });
      } else {
        await onSubmit(payload);
      }
    } catch (error) {
      setFormError(getRegularizeMutationErrorMessage(error, "Não foi possível salvar a senha."));
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
      title={isEditing ? "Editar senha" : "Nova senha"}
      description="Formulário de senha por cliente do Regularize."
      contentClassName="w-[min(92vw,760px)]"
      bodyClassName="max-h-[72vh] overflow-y-auto"
    >
      {isLoadingInitialValue ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          Carregando dados...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <RegularizeFormError message={formError} />

          <div className="grid gap-4 md:grid-cols-2">
          <RegularizeFormField label="Cliente" required>
              <RegularizeClientPickerField
                value={formState.client_id}
                onChange={(clientId) => handleChange("client_id", clientId)}
              />
          </RegularizeFormField>

            <RegularizeFormField label="Site" required>
              <RegularizeNativeSelect
                value={formState.site_id}
                onChange={(event) => handleChange("site_id", event.target.value)}
              >
                <option value="">Selecione</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label}
                  </option>
                ))}
              </RegularizeNativeSelect>
            </RegularizeFormField>

            <RegularizeFormField label="Login" required>
              <input
                value={formState.login}
                onChange={(event) => handleChange("login", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Senha" required>
              <input
                type="password"
                value={formState.password}
                onChange={(event) => handleChange("password", event.target.value)}
                className={regularizeTextFieldClassName}
              />
            </RegularizeFormField>

            <RegularizeFormField label="Observação" className="md:col-span-2">
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
            submitLabel={isEditing ? "Salvar alterações" : "Criar senha"}
          />
        </form>
      )}
    </Dialog>
  );
}
