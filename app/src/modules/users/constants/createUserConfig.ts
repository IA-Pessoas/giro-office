import type { UserPermission } from "../types";

export const TEMPORARY_DEPARTMENTS = [
  { id: "default-department", name: "Administracao" },
  { id: "dept-admin", name: "Administracao" },
  { id: "dept-comercial", name: "Comercial" },
  { id: "dept-contabil", name: "Contabil" },
  { id: "dept-financeiro", name: "Financeiro" },
  { id: "dept-fiscal", name: "Fiscal" },
  { id: "dept-pessoal", name: "Pessoal" },
  { id: "dept-rh", name: "Recursos Humanos" },
  { id: "dept-ti", name: "Tecnologia" },
] as const;

export const CREATE_USER_PERMISSION_OPTIONS: Array<{ value: UserPermission; label: string }> = [
  { value: 0, label: "Visualizador" },
  { value: 1, label: "Usuário" },
  { value: 2, label: "Administrador" },
];

export const CREATE_USER_MODULE_OPTIONS = [
  { key: "atendimento", label: "Atendimento" },
  { key: "certificado", label: "Certificado" },
  { key: "comercial", label: "Comercial" },
  { key: "contabil", label: "Contábil" },
  { key: "financeiro", label: "Financeiro" },
  { key: "fiscal", label: "Fiscal" },
  { key: "integracao", label: "Integracao" },
  { key: "marketing", label: "Marketing" },
  { key: "parcelamento", label: "Parcelamento" },
  { key: "pec", label: "PEC" },
  { key: "pessoal", label: "Pessoal" },
  { key: "regularize", label: "Regularize" },
  { key: "rh", label: "RH" },
  { key: "ti", label: "Tecnologia" },
  { key: "triagem", label: "Triagem" },
  { key: "wiki", label: "Wiki" },
] as const;
