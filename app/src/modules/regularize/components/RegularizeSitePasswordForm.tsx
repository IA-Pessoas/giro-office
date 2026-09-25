import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";

import type {
  CreateRegularizeSitePasswordPayload,
  RegularizeSitePasswordDetail,
  UpdateRegularizeSitePasswordPayload,
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
  regularizeTextFieldClassName,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

type RegularizeSitePasswordFormState = {
  name: string;
  sphere: string;
  link: string;
  user: string;
  password: string;
  status: boolean;
};

const DEFAULT_SITE_PASSWORD_FORM_STATE: RegularizeSitePasswordFormState = {
  name: "",
  sphere: "",
  link: "",
  user: "",
  password: "",
  status: true,
};

function buildSitePasswordFormState(
  sitePassword: RegularizeSitePasswordDetail | null,
): RegularizeSitePasswordFormState {
  if (!sitePassword) {
    return DEFAULT_SITE_PASSWORD_FORM_STATE;
  }

  return {
    name: sitePassword.name ?? "",
    // "legacy" veio da migração; o usuário precisa escolher o escopo real ao editar (#1347).
    sphere: sitePassword.sphere === "legacy" ? "" : (sitePassword.sphere ?? ""),
    link: sitePassword.link ?? "",
    user: sitePassword.user ?? "",
    password: sitePassword.password ?? "",
    status: sitePassword.status,
  };
}

export function RegularizeSitePasswordForm({
  isLoadingInitialValue = false,
  isSubmitting,
  onClose,
  onSubmit,
  open,
  mode,
  sitePassword,
}: {
  isLoadingInitialValue?: boolean;
  isSubmitting: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizeSitePasswordPayload | UpdateRegularizeSitePasswordPayload,
  ) => Promise<void>;
  open: boolean;
  sitePassword: RegularizeSitePasswordDetail | null;
}) {
  const [formState, setFormState] = useState<RegularizeSitePasswordFormState>(
    buildSitePasswordFormState(sitePassword),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = mode === "edit";

  useEffect(() => {
    if (open) {
      setFormState(buildSitePasswordFormState(sitePassword));
      setFormError(null);
    }
  }, [open, sitePassword]);

  function handleChange<K extends keyof RegularizeSitePasswordFormState>(
    key: K,
    value: RegularizeSitePasswordFormState[K],
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

    if (isEditing && !sitePassword) {
      setFormError("Não foi possível carregar os dados do site.");
      return;
    }

    if (
      !formState.name.trim() ||
      !formState.sphere.trim() ||
      !formState.user.trim() ||
      !formState.password.trim()
    ) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    const payload = {
      name: trimRegularizeText(formState.name),
      sphere: trimRegularizeText(formState.sphere),
      link: trimRegularizeNullableText(formState.link),
      user: trimRegularizeText(formState.user),
      password: formState.password,
    };

    try {
      if (isEditing && sitePassword) {
        await onSubmit({
          ...payload,
          id: sitePassword.id,
          status: formState.status,
        });
      } else {
        await onSubmit(payload);
      }
    } catch (error) {
      setFormError(getRegularizeMutationErrorMessage(error, "Não foi possível salvar o site."));
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
      title={isEditing ? "Editar site" : "Novo site"}
      description="Formulário de site base do Regularize."
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
            <RegularizeFormField label="Nome" required>
              <input
                value={formState.name}
                onChange={(event) => handleChange("name", event.target.value)}
                className={regularizeTextFieldClassName}
                placeholder="Portal da prefeitura"
              />
            </RegularizeFormField>

            <RegularizeFormField label="Escopo" required>
              <input
                value={formState.sphere}
                onChange={(event) => handleChange("sphere", event.target.value)}
                className={regularizeTextFieldClassName}
                placeholder="Municipal"
              />
            </RegularizeFormField>

            <RegularizeFormField label="Usuário" required>
              <input
                value={formState.user}
                onChange={(event) => handleChange("user", event.target.value)}
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

            <RegularizeFormField label="Link" className="md:col-span-2">
              <input
                type="url"
                value={formState.link}
                onChange={(event) => handleChange("link", event.target.value)}
                className={regularizeTextFieldClassName}
                placeholder="https://..."
              />
            </RegularizeFormField>

            {isEditing ? (
              <RegularizeFormField label="Status">
                <RegularizeNativeSelect
                  value={formState.status ? "true" : "false"}
                  onChange={(event) => handleChange("status", event.target.value === "true")}
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </RegularizeNativeSelect>
              </RegularizeFormField>
            ) : null}
          </div>

          <RegularizeFormActions
            isSubmitting={isSubmitting}
            onCancel={onClose}
            submitLabel={isEditing ? "Salvar alterações" : "Criar site"}
          />
        </form>
      )}
    </Dialog>
  );
}
