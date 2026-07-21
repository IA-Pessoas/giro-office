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
import type {
  CertificatePf,
  CertificatePj,
  CreateCertificatePfBody,
  CreateCertificatePjBody,
  UpdateCertificatePfBody,
  UpdateCertificatePjBody,
} from "../types";

type BaseFormState = {
  clientCasteloStatus: boolean;
  clientFocusStatus: boolean;
  name: string;
  model: string;
  password: string;
  expirationDate: string;
  notes: string;
  wasPaid: boolean;
  paymentDate: string;
  paymentAmount: string;
  contactInfo: string;
};

type PjFormState = BaseFormState & {
  kind: "pj";
  cnpj: string;
  responsible: string;
  legalNature: string;
  enterprise?: never;
  cpf?: never;
};

type PfFormState = BaseFormState & {
  kind: "pf";
  cpf: string;
  enterprise: string;
  cnpj: string;
  legalNature?: never;
  responsible?: never;
};

type CertificateFormState = PjFormState | PfFormState;

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

function toInputDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePaymentAmount(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) {
    return null;
  }

  const amount = Number(trimmed);
  if (Number.isNaN(amount)) {
    return Number.NaN;
  }

  return amount;
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
      cnpj: initialPj?.cnpj ?? "",
      responsible: initialPj?.responsible ?? "",
      model: initialPj?.model ?? "",
      legalNature: initialPj?.legal_nature ?? "",
      password: "",
      expirationDate: toInputDate(initialPj?.expiration_date),
      notes: initialPj?.notes ?? "",
      wasPaid: initialPj?.was_paid ?? false,
      paymentDate: toInputDate(initialPj?.payment_date),
      paymentAmount: initialPj?.payment_amount != null ? String(initialPj.payment_amount) : "",
      contactInfo: initialPj?.contact_info ?? "",
    };
  }

  const initialPf = (initial as CertificatePf | undefined) ?? null;
  return {
    kind: "pf",
    clientCasteloStatus: initialPf?.client_castelo_status ?? false,
    clientFocusStatus: initialPf?.client_focus_status ?? false,
    name: initialPf?.name ?? "",
    cpf: initialPf?.cpf ?? "",
    enterprise: initialPf?.enterprise ?? "",
    model: initialPf?.model ?? "",
    cnpj: initialPf?.cnpj ?? "",
    password: "",
    expirationDate: toInputDate(initialPf?.expiration_date),
    notes: initialPf?.notes ?? "",
    wasPaid: initialPf?.was_paid ?? false,
    paymentDate: toInputDate(initialPf?.payment_date),
    paymentAmount: initialPf?.payment_amount != null ? String(initialPf.payment_amount) : "",
    contactInfo: initialPf?.contact_info ?? "",
  };
}

function getHasChanges(
  current: CertificateFormState,
  initial: CertificateFormState,
): boolean {
  return JSON.stringify(current) !== JSON.stringify(initial);
}

function getCreatePjPayload(state: PjFormState): CreateCertificatePjBody {
  return {
    client_castelo_status: state.clientCasteloStatus,
    client_focus_status: state.clientFocusStatus,
    name: state.name.trim(),
    cnpj: state.cnpj.trim(),
    responsible: state.responsible.trim(),
    model: state.model.trim(),
    legal_nature: state.legalNature.trim(),
    password: state.password.trim(),
    expiration_date: state.expirationDate,
    notes: normalizeOptionalText(state.notes),
    was_paid: state.wasPaid,
    payment_date: state.wasPaid ? normalizeOptionalText(state.paymentDate) : null,
    payment_amount: state.wasPaid ? parsePaymentAmount(state.paymentAmount) : null,
    contact_info: normalizeOptionalText(state.contactInfo),
  };
}

function getCreatePfPayload(state: PfFormState): CreateCertificatePfBody {
  return {
    client_castelo_status: state.clientCasteloStatus,
    client_focus_status: state.clientFocusStatus,
    name: state.name.trim(),
    cpf: state.cpf.trim(),
    model: state.model.trim(),
    password: state.password.trim(),
    expiration_date: state.expirationDate,
    notes: normalizeOptionalText(state.notes),
    enterprise: normalizeOptionalText(state.enterprise),
    cnpj: normalizeOptionalText(state.cnpj),
    was_paid: state.wasPaid,
    payment_date: state.wasPaid ? normalizeOptionalText(state.paymentDate) : null,
    payment_amount: state.wasPaid ? parsePaymentAmount(state.paymentAmount) : null,
    contact_info: normalizeOptionalText(state.contactInfo),
  };
}

function getUpdatePjPayload(
  current: PjFormState,
  initial: PjFormState,
): UpdateCertificatePjBody | null {
  const payload: UpdateCertificatePjBody = {};

  if (current.name.trim() && current.name !== initial.name) {
    payload.name = current.name.trim();
  }

  if (current.cnpj.trim() && current.cnpj !== initial.cnpj) {
    payload.cnpj = current.cnpj.trim();
  }

  if (current.responsible.trim() && current.responsible !== initial.responsible) {
    payload.responsible = current.responsible.trim();
  }

  if (current.model.trim() && current.model !== initial.model) {
    payload.model = current.model.trim();
  }

  if (current.legalNature.trim() && current.legalNature !== initial.legalNature) {
    payload.legal_nature = current.legalNature.trim();
  }

  if (hasText(current.password) && current.password !== "") {
    payload.password = current.password.trim();
  }

  if (current.expirationDate && current.expirationDate !== initial.expirationDate) {
    payload.expiration_date = current.expirationDate;
  }

  if (current.notes !== initial.notes) {
    payload.notes = normalizeOptionalText(current.notes);
  }

  if (current.contactInfo !== initial.contactInfo) {
    payload.contact_info = normalizeOptionalText(current.contactInfo);
  }

  if (current.clientCasteloStatus !== initial.clientCasteloStatus) {
    payload.client_castelo_status = current.clientCasteloStatus;
  }

  if (current.clientFocusStatus !== initial.clientFocusStatus) {
    payload.client_focus_status = current.clientFocusStatus;
  }

  if (current.wasPaid !== initial.wasPaid) {
    payload.was_paid = current.wasPaid;
  }

  if (current.wasPaid) {
    if (current.paymentDate !== initial.paymentDate) {
      payload.payment_date = normalizeOptionalText(current.paymentDate);
    }
    if (current.paymentAmount !== initial.paymentAmount) {
      payload.payment_amount = current.paymentAmount ? parsePaymentAmount(current.paymentAmount) : null;
    }
  } else if (current.wasPaid === false && initial.wasPaid) {
    payload.payment_date = null;
    payload.payment_amount = null;
  }

  return Object.keys(payload).length === 0 ? null : payload;
}

function getUpdatePfPayload(
  current: PfFormState,
  initial: PfFormState,
): UpdateCertificatePfBody | null {
  const payload: UpdateCertificatePfBody = {};

  if (current.name.trim() && current.name !== initial.name) {
    payload.name = current.name.trim();
  }

  if (hasText(current.cpf) && current.cpf !== initial.cpf) {
    payload.cpf = current.cpf.trim();
  }

  if (current.model.trim() && current.model !== initial.model) {
    payload.model = current.model.trim();
  }

  if (current.cnpj !== initial.cnpj) {
    payload.cnpj = normalizeOptionalText(current.cnpj);
  }

  if (current.enterprise !== initial.enterprise) {
    payload.enterprise = normalizeOptionalText(current.enterprise);
  }

  if (hasText(current.password) && current.password !== "") {
    payload.password = current.password.trim();
  }

  if (current.expirationDate && current.expirationDate !== initial.expirationDate) {
    payload.expiration_date = current.expirationDate;
  }

  if (current.notes !== initial.notes) {
    payload.notes = normalizeOptionalText(current.notes);
  }

  if (current.contactInfo !== initial.contactInfo) {
    payload.contact_info = normalizeOptionalText(current.contactInfo);
  }

  if (current.clientCasteloStatus !== initial.clientCasteloStatus) {
    payload.client_castelo_status = current.clientCasteloStatus;
  }

  if (current.clientFocusStatus !== initial.clientFocusStatus) {
    payload.client_focus_status = current.clientFocusStatus;
  }

  if (current.wasPaid !== initial.wasPaid) {
    payload.was_paid = current.wasPaid;
  }

  if (current.wasPaid) {
    if (current.paymentDate !== initial.paymentDate) {
      payload.payment_date = normalizeOptionalText(current.paymentDate);
    }

    if (current.paymentAmount !== initial.paymentAmount) {
      payload.payment_amount = current.paymentAmount ? parsePaymentAmount(current.paymentAmount) : null;
    }
  } else if (current.wasPaid === false && initial.wasPaid) {
    payload.payment_date = null;
    payload.payment_amount = null;
  }

  return Object.keys(payload).length === 0 ? null : payload;
}

function getInvalidAmountMessage(payloadAmount: number | null, original: string): string | null {
  if (original.trim() && Number.isNaN(payloadAmount)) {
    return "Informe um valor de pagamento válido.";
  }

  return null;
}

function boolToLabel(value: boolean) {
  return value ? "Sim" : "Não";
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
      const normalizedAmount = state.wasPaid ? parsePaymentAmount(state.paymentAmount) : null;
      const invalidAmountMessage = getInvalidAmountMessage(normalizedAmount, state.paymentAmount);

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
    const normalizedAmount = state.wasPaid ? parsePaymentAmount(state.paymentAmount) : null;
    const invalidAmountMessage = getInvalidAmountMessage(normalizedAmount, state.paymentAmount);

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
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Nome</span>
          <input
            type="text"
            value={formState.name}
            onChange={(event) => updateField("name", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>
            {isPj ? "CNPJ" : "CPF"}
          </span>
          <input
            type="text"
            value={formState.kind === "pj" ? formState.cnpj : formState.cpf}
            onChange={(event) =>
              updateField((isPj ? "cnpj" : "cpf") as keyof CertificateFormState, event.target.value)
            }
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Modelo</span>
          <input
            type="text"
            value={formState.model}
            onChange={(event) => updateField("model", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
          />
        </label>

        {isPj ? (
          <>
            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Responsável</span>
              <input
                type="text"
                value={formState.responsible}
                onChange={(event) =>
                  updateField("responsible", (event.target.value as CertificateFormState["responsible"]) ?? "")
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                disabled={isSubmitting}
              />
            </label>

            <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
              <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Natureza jurídica</span>
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
                  updateField("cnpj", event.target.value as CertificateFormState["cnpj"])
                }
                className={CERTIFICATE_INPUT_CLASSNAME}
                disabled={isSubmitting}
              />
            </label>
          </>
        )}

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Senha</span>
          <input
            type="text"
            value={formState.password}
            onChange={(event) => updateField("password", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
            placeholder={isCreate ? "Senha nova" : "Nova senha (opcional)"}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Vencimento</span>
          <input
            type="date"
            value={formState.expirationDate}
            onChange={(event) => updateField("expirationDate", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Contato</span>
          <input
            type="text"
            value={formState.contactInfo}
            onChange={(event) => updateField("contactInfo", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting}
          />
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Situação Castelo</span>
          <CertificateNativeSelect
            value={boolToLabel(formState.clientCasteloStatus)}
            onChange={(event) => setBoolField("clientCasteloStatus", event.target.value === "Sim")}
            disabled={isSubmitting}
          >
            <option value="Não">Não</option>
            <option value="Sim">Sim</option>
          </CertificateNativeSelect>
        </label>

        <label className={CERTIFICATE_FILTER_LABEL_CLASSNAME}>
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Situação Focus</span>
          <CertificateNativeSelect
            value={boolToLabel(formState.clientFocusStatus)}
            onChange={(event) => setBoolField("clientFocusStatus", event.target.value === "Sim")}
            disabled={isSubmitting}
          >
            <option value="Não">Não</option>
            <option value="Sim">Sim</option>
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
          <span className={CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME}>Valor pago</span>
          <input
            type="text"
            value={formState.paymentAmount}
            onChange={(event) => updateField("paymentAmount", event.target.value)}
            className={CERTIFICATE_INPUT_CLASSNAME}
            disabled={isSubmitting || !formState.wasPaid}
            placeholder="0.00"
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
