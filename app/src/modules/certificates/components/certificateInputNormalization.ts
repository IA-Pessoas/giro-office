import { normalizeDigits, parseBrlInput } from "../../../shared/utils/inputFormatting.ts";
import type {
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

export type PjFormState = BaseFormState & {
  kind: "pj";
  cnpj: string;
  responsible: string;
  legalNature: string;
  enterprise?: never;
  cpf?: never;
};

export type PfFormState = BaseFormState & {
  kind: "pf";
  cpf: string;
  enterprise: string;
  cnpj: string;
  legalNature?: never;
  responsible?: never;
};

export type CertificateFormState = PjFormState | PfFormState;

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

export function normalizeCertificateDocumentFilter(value: string): string | undefined {
  return normalizeDigits(value) || undefined;
}

export function getCreatePjPayload(state: PjFormState): CreateCertificatePjBody {
  return {
    client_castelo_status: state.clientCasteloStatus,
    client_focus_status: state.clientFocusStatus,
    name: state.name.trim(),
    cnpj: normalizeDigits(state.cnpj),
    responsible: state.responsible.trim(),
    model: state.model.trim(),
    legal_nature: state.legalNature.trim(),
    password: state.password.trim(),
    expiration_date: state.expirationDate,
    notes: normalizeOptionalText(state.notes),
    was_paid: state.wasPaid,
    payment_date: state.wasPaid ? normalizeOptionalText(state.paymentDate) : null,
    payment_amount: state.wasPaid ? parseBrlInput(state.paymentAmount) : null,
    contact_info: normalizeOptionalText(state.contactInfo),
  };
}

export function getCreatePfPayload(state: PfFormState): CreateCertificatePfBody {
  return {
    client_castelo_status: state.clientCasteloStatus,
    client_focus_status: state.clientFocusStatus,
    name: state.name.trim(),
    cpf: normalizeDigits(state.cpf),
    model: state.model.trim(),
    password: state.password.trim(),
    expiration_date: state.expirationDate,
    notes: normalizeOptionalText(state.notes),
    enterprise: normalizeOptionalText(state.enterprise),
    cnpj: normalizeOptionalText(normalizeDigits(state.cnpj)),
    was_paid: state.wasPaid,
    payment_date: state.wasPaid ? normalizeOptionalText(state.paymentDate) : null,
    payment_amount: state.wasPaid ? parseBrlInput(state.paymentAmount) : null,
    contact_info: normalizeOptionalText(state.contactInfo),
  };
}

export function getUpdatePjPayload(
  current: PjFormState,
  initial: PjFormState,
): UpdateCertificatePjBody | null {
  const payload: UpdateCertificatePjBody = {};

  if (current.name.trim() && current.name !== initial.name) {
    payload.name = current.name.trim();
  }

  if (
    normalizeDigits(current.cnpj) &&
    normalizeDigits(current.cnpj) !== normalizeDigits(initial.cnpj)
  ) {
    payload.cnpj = normalizeDigits(current.cnpj);
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
    if (parseBrlInput(current.paymentAmount) !== parseBrlInput(initial.paymentAmount)) {
      payload.payment_amount = current.paymentAmount ? parseBrlInput(current.paymentAmount) : null;
    }
  } else if (current.wasPaid === false && initial.wasPaid) {
    payload.payment_date = null;
    payload.payment_amount = null;
  }

  return Object.keys(payload).length === 0 ? null : payload;
}

export function getUpdatePfPayload(
  current: PfFormState,
  initial: PfFormState,
): UpdateCertificatePfBody | null {
  const payload: UpdateCertificatePfBody = {};

  if (current.name.trim() && current.name !== initial.name) {
    payload.name = current.name.trim();
  }

  if (
    normalizeDigits(current.cpf) &&
    normalizeDigits(current.cpf) !== normalizeDigits(initial.cpf)
  ) {
    payload.cpf = normalizeDigits(current.cpf);
  }

  if (current.model.trim() && current.model !== initial.model) {
    payload.model = current.model.trim();
  }

  if (normalizeDigits(current.cnpj) !== normalizeDigits(initial.cnpj)) {
    payload.cnpj = normalizeOptionalText(normalizeDigits(current.cnpj));
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

    if (parseBrlInput(current.paymentAmount) !== parseBrlInput(initial.paymentAmount)) {
      payload.payment_amount = current.paymentAmount ? parseBrlInput(current.paymentAmount) : null;
    }
  } else if (current.wasPaid === false && initial.wasPaid) {
    payload.payment_date = null;
    payload.payment_amount = null;
  }

  return Object.keys(payload).length === 0 ? null : payload;
}
