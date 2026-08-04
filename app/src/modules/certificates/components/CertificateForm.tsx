import { useEffect, useMemo, useState } from "react";

import {
  CERTIFICATE_FORM_CLASSNAME,
  CERTIFICATE_FORM_GRID_CLASSNAME,
  CERTIFICATE_FORM_TEXTAREA_CLASSNAME,
  CERTIFICATE_FILTER_LABEL_CLASSNAME,
  CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME,
  CERTIFICATE_INPUT_CLASSNAME,
} from "./certificateWorkspaceUi";
import { CertificateNativeSelect } from "./CertificateNativeSelect";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import { FieldHelp } from "@shared/ui/newLayout/field-help";
import {
  formatBrazilianPhoneInput,
  formatBrlInput,
  formatCnpjInput,
  formatCpfInput,
} from "@shared/utils/inputFormatting";
import {
  getCreatePfPayload,
  getCreatePjPayload,
  getPaymentAmountValidationError,
  getUpdatePfPayload,
  getUpdatePjPayload,
  type CertificateFormState,
  type PfFormState,
  type PjFormState,
} from "./certificateInputNormalization";
import type {
  CertificatePf,
  CertificatePj,
  CreateCertificatePfBody,
  CreateCertificatePjBody,
  UpdateCertificatePfBody,
  UpdateCertificatePjBody,
} from "../types";

type CreateFormPayload = CreateCertificatePjBody | CreateCertificatePfBody;
type UpdateFormPayload = UpdateCertificatePjBody | UpdateCertificatePfBody;

type BaseCreateProps = {
  mode: "create";
  isSubmitting: boolean;
  initialData?: never;
  formId: string;
};

type BaseEditProps = {
  mode: "edit";
  isSubmitting: boolean;
  formId: string;
};

type PJCreateFormProps = BaseCreateProps & {
  kind: "pj";
  onSubmit: (payload: CreateCertificatePjBody) => Promise<void> | void;
};

type PFCreateFormProps = BaseCreateProps & {
  kind: "pf";
  onSubmit: (payload: CreateCertificatePfBody) => Promise<void> | void;
};

type PJEditFormProps = BaseEditProps & {
  kind: "pj";
  initialData: CertificatePj;
  onSubmit: (payload: UpdateCertificatePjBody) => Promise<void> | void;
};

type PFEditFormProps = BaseEditProps & {
  kind: "pf";
  initialData: CertificatePf;
  onSubmit: (payload: UpdateCertificatePfBody) => Promise<void> | void;
};

type CertificateFormProps = PJCreateFormProps | PFCreateFormProps | PJEditFormProps | PFEditFormProps;

const CERTIFICATE_STATUS_OPTIONS = [
  { value: "false", label: "Não regularizado" },
  { value: "true", label: "Regularizado" },
] as const;

function toInputDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function buildInitialFormState(formKind: "pj", initial?: CertificatePj): PjFormState;
function buildInitialFormState(formKind: "pf", initial?: CertificatePf): PfFormState;
function buildInitialFormState(
  formKind: "pj" | "pf",
  initial?: CertificatePj | CertificatePf,
): CertificateFormState;
function buildInitialFormState(formKind: "pj" | "pf", initial?: CertificatePj | CertificatePf): CertificateFormState {
  if (formKind === "pj") {
    const initialPj = (initial as CertificatePj | undefined) ?? null;
    return {
      kind: "pj",
      clientCasteloStatus: initialPj?.client_castelo_status ?? false,
      clientFocusStatus: initialPj?.client_focus_status ?? false,
      name: initialPj?.name ?? "",
      cnpj: formatCnpjInput(initialPj?.cnpj ?? ""),
      responsible: initialPj?.responsible ?? "",
      model: initialPj?.model ?? "",
      legalNature: initialPj?.legal_nature ?? "",
      password: "",
      expirationDate: toInputDate(initialPj?.expiration_date),
      notes: initialPj?.notes ?? "",
      wasPaid: initialPj?.was_paid ?? false,
      paymentDate: toInputDate(initialPj?.payment_date),
      paymentAmount:
        initialPj?.payment_amount != null
          ? formatBrlInput(String(Math.round(initialPj.payment_amount * 100)))
          : "",
      contactInfo: formatBrazilianPhoneInput(initialPj?.contact_info ?? ""),
    };
  }

  const initialPf = (initial as CertificatePf | undefined) ?? null;
  return {
    kind: "pf",
    clientCasteloStatus: initialPf?.client_castelo_status ?? false,
    clientFocusStatus: initialPf?.client_focus_status ?? false,
    name: initialPf?.name ?? "",
    cpf: formatCpfInput(initialPf?.cpf ?? ""),
    enterprise: initialPf?.enterprise ?? "",
    model: initialPf?.model ?? "",
    cnpj: formatCnpjInput(initialPf?.cnpj ?? ""),
    password: "",
    expirationDate: toInputDate(initialPf?.expiration_date),
    notes: initialPf?.notes ?? "",
    wasPaid: initialPf?.was_paid ?? false,
    paymentDate: toInputDate(initialPf?.payment_date),
    paymentAmount:
      initialPf?.payment_amount != null
        ? formatBrlInput(String(Math.round(initialPf.payment_amount * 100)))
        : "",
    contactInfo: formatBrazilianPhoneInput(initialPf?.contact_info ?? ""),
  };
}

function getHasChanges(
  current: CertificateFormState,
  initial: CertificateFormState,
): boolean {
  return JSON.stringify(current) !== JSON.stringify(initial);
}

function boolToLabel(value: boolean) {
  return value ? "Sim" : "Não";
}

function certificateStatusValue(value: boolean): string {
  return value ? "true" : "false";
}

export function CertificateForm({
  kind,
  mode,
  isSubmitting,
  onSubmit,
  initialData,
  formId,
}: CertificateFormProps) {
  const isCreate = mode === "create";
  const isPj = kind === "pj";
  const initialState = useMemo(
    () => buildInitialFormState(kind, initialData as CertificatePj | CertificatePf | undefined),
    [kind, initialData],
  );
  const [formState, setFormState] = useState<CertificateFormState>(() => initialState);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    setFormState(initialState);
    setErrorMessage("");
  }, [initialState]);

  function updateField<Key extends keyof CertificateFormState>(field: Key, value: CertificateFormState[Key]) {
    setFormState((currentState) => ({ ...currentState, [field]: value }));
  }

  function setBoolField<Key extends "clientCasteloStatus" | "clientFocusStatus" | "wasPaid">(field: Key, value: boolean) {
    updateField(field, value);
  }

  async function handleSubmit() {
    setErrorMessage("");

    if (isPj) {
      const state = formState as PjFormState;
      const invalidAmountMessage = getPaymentAmountValidationError(
        state.paymentAmount,
        state.wasPaid,
      );

      if (invalidAmountMessage) {
        setErrorMessage(invalidAmountMessage);
        return;
      }

      if (isCreate) {
        if (!hasText(state.name)) {
          setErrorMessage("Informe o nome do cliente.");
          return;
        }
        if (!hasText(state.cnpj)) {
          setErrorMessage("Informe o CNPJ.");
          return;
        }
        if (!hasText(state.responsible)) {
          setErrorMessage("Informe o responsável.");
          return;
        }
        if (!hasText(state.model)) {
          setErrorMessage("Informe o modelo.");
          return;
        }
        if (!hasText(state.legalNature)) {
          setErrorMessage("Informe a natureza jurídica.");
          return;
        }
        if (!hasText(state.password)) {
          setErrorMessage("Informe a senha.");
          return;
        }
        if (!state.expirationDate) {
          setErrorMessage("Informe a data de vencimento.");
          return;
        }

        const payload = getCreatePjPayload(state);
        try {
          await (onSubmit as (payload: CreateFormPayload) => Promise<void> | void)(payload);
        } catch {
          setErrorMessage("Erro ao salvar novo certificado PJ. Tente novamente.");
        }
        return;
      }

      if (!getHasChanges(state, initialState as PjFormState)) {
        setErrorMessage("Altere algum campo para atualizar.");
        return;
      }

      const payload = getUpdatePjPayload(state, initialState as PjFormState);
      if (!payload) {
        setErrorMessage("Altere algum campo para atualizar.");
        return;
      }

      try {
        await (onSubmit as (payload: UpdateFormPayload) => Promise<void> | void)(payload);
      } catch {
        setErrorMessage("Erro ao atualizar certificado PJ. Tente novamente.");
      }
      return;
    }

    const state = formState as PfFormState;
    const invalidAmountMessage = getPaymentAmountValidationError(
      state.paymentAmount,
      state.wasPaid,
    );

    if (invalidAmountMessage) {
      setErrorMessage(invalidAmountMessage);
      return;
    }

    if (isCreate) {
      if (!hasText(state.name)) {
        setErrorMessage("Informe o nome do titular.");
        return;
      }
      if (!hasText(state.cpf)) {
        setErrorMessage("Informe o CPF.");
        return;
      }
      if (!hasText(state.model)) {
        setErrorMessage("Informe o modelo.");
        return;
      }
      if (!hasText(state.password)) {
        setErrorMessage("Informe a senha.");
        return;
      }
      if (!state.expirationDate) {
        setErrorMessage("Informe a data de vencimento.");
        return;
      }

      const payload = getCreatePfPayload(state);
      try {
        await (onSubmit as (payload: CreateFormPayload) => Promise<void> | void)(payload);
      } catch {
        setErrorMessage("Erro ao salvar novo certificado PF. Tente novamente.");
      }
      return;
    }

    if (!getHasChanges(state, initialState as PfFormState)) {
      setErrorMessage("Altere algum campo para atualizar.");
      return;
    }

    const payload = getUpdatePfPayload(state, initialState as PfFormState);
    if (!payload) {
      setErrorMessage("Altere algum campo para atualizar.");
      return;
    }

    try {
      await (onSubmit as (payload: UpdateFormPayload) => Promise<void> | void)(payload);
    } catch {
      setErrorMessage("Erro ao atualizar certificado PF. Tente novamente.");
    }
  }

  return (
    <form
      id={formId}
      className={CERTIFICATE_FORM_CLASSNAME}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {errorMessage ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      <section className={CERTIFICATE_FORM_GRID_CLASSNAME}>
        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <RequiredFieldLabel className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME} required={isCreate}>
            Nome
          </RequiredFieldLabel>
          <input
            type="text"
            value={formState.name}
            onChange={(event) => updateField("name", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
            aria-required={isCreate}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <RequiredFieldLabel className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME} required={isCreate}>
            {isPj ? "CNPJ" : "CPF"}
          </RequiredFieldLabel>
          <input
            type="text"
            value={formState.kind === "pj" ? formState.cnpj : formState.cpf}
            onChange={(event) =>
              updateField(
                (isPj ? "cnpj" : "cpf") as keyof CertificateFormState,
                isPj ? formatCnpjInput(event.target.value) : formatCpfInput(event.target.value),
              )
            }
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
            aria-required={isCreate}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <RequiredFieldLabel className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME} required={isCreate}>
            Modelo
          </RequiredFieldLabel>
          <input
            type="text"
            value={formState.model}
            onChange={(event) => updateField("model", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
            aria-required={isCreate}
          />
        </label>

        {isPj ? (
          <>
            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <RequiredFieldLabel className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME} required={isCreate}>
                Responsável
              </RequiredFieldLabel>
              <input
                type="text"
                value={formState.responsible}
                onChange={(event) =>
                  updateField("responsible", (event.target.value as CertificateFormState["responsible"]) ?? "")
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                disabled={isSubmitting}
                aria-required={isCreate}
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className="inline-flex items-center gap-1">
                <RequiredFieldLabel className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME} required={isCreate}>
                  Natureza jurídica
                </RequiredFieldLabel>
                <FieldHelp
                  label="Natureza jurídica"
                  description="Classificação jurídica da empresa conforme o cadastro oficial."
                />
              </span>
              <input
                type="text"
                value={formState.legalNature}
                onChange={(event) =>
                  updateField(
                    "legalNature",
                    (event.target.value as CertificateFormState["legalNature"]) ?? "",
                  )
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                disabled={isSubmitting}
                aria-required={isCreate}
              />
            </label>
          </>
        ) : (
          <>
            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Empresa</span>
              <input
                type="text"
                value={formState.enterprise}
                onChange={(event) =>
                  updateField("enterprise", (event.target.value as CertificateFormState["enterprise"]) ?? "")
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                disabled={isSubmitting}
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>CNPJ da empresa</span>
              <input
                type="text"
                value={formState.cnpj}
                onChange={(event) =>
                  updateField("cnpj", formatCnpjInput(event.target.value) as CertificateFormState["cnpj"])
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                disabled={isSubmitting}
              />
            </label>
          </>
        )}

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <RequiredFieldLabel className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME} required={isCreate}>
            Senha
          </RequiredFieldLabel>
          <input
            type="text"
            value={formState.password}
            onChange={(event) => updateField("password", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
            placeholder={isCreate ? "Senha nova" : "Nova senha (opcional)"}
            aria-required={isCreate}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <RequiredFieldLabel className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME} required={isCreate}>
            Vencimento
          </RequiredFieldLabel>
          <input
            type="date"
            value={formState.expirationDate}
            onChange={(event) => updateField("expirationDate", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
            aria-required={isCreate}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Contato</span>
          <input
            type="text"
            value={formState.contactInfo}
            onChange={(event) =>
              updateField("contactInfo", formatBrazilianPhoneInput(event.target.value))
            }
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className="inline-flex items-center gap-1">
            <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Situação Castelo</span>
            <FieldHelp
              label="Situação Castelo"
              description="Indica se este certificado está regularizado no sistema Castelo."
            />
          </span>
          <CertificateNativeSelect
            value={certificateStatusValue(formState.clientCasteloStatus)}
            onChange={(event) => setBoolField("clientCasteloStatus", event.target.value === "true")}
            disabled={isSubmitting}
          >
            {CERTIFICATE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </CertificateNativeSelect>
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className="inline-flex items-center gap-1">
            <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Situação Focus</span>
            <FieldHelp
              label="Situação Focus"
              description="Indica se este certificado está regularizado no sistema Focus."
            />
          </span>
          <CertificateNativeSelect
            value={certificateStatusValue(formState.clientFocusStatus)}
            onChange={(event) => setBoolField("clientFocusStatus", event.target.value === "true")}
            disabled={isSubmitting}
          >
            {CERTIFICATE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </CertificateNativeSelect>
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Pago</span>
          <CertificateNativeSelect
            value={boolToLabel(formState.wasPaid)}
            onChange={(event) => setBoolField("wasPaid", event.target.value === "Sim")}
            disabled={isSubmitting}
          >
            <option value="Não">Não</option>
            <option value="Sim">Sim</option>
          </CertificateNativeSelect>
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Data de pagamento</span>
          <input
            type="date"
            value={formState.paymentDate}
            onChange={(event) => updateField("paymentDate", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting || !formState.wasPaid}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className="inline-flex items-center gap-1">
            <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Valor pago</span>
            <FieldHelp
              label="Valor pago"
              description="Informe o valor pago em reais, usando o formato R$ 0,00."
            />
          </span>
          <input
            type="text"
            value={formState.paymentAmount}
            onChange={(event) => updateField("paymentAmount", formatBrlInput(event.target.value))}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting || !formState.wasPaid}
            placeholder="R$ 0,00"
          />
        </label>

        <label className="col-span-full space-y-2">
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Observações</span>
          <textarea
            value={formState.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            className={`${CERTIFICATE_INPUT_CLASSNAME} ${CERTIFICATE_FORM_TEXTAREA_CLASSNAME}`}
            disabled={isSubmitting}
          />
        </label>
      </section>
    </form>
  );
}

export type {
  CreateFormPayload,
  UpdateFormPayload,
};
