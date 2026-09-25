import type { PermissionLevel } from "./permissionConfig";

export const TEMPORARY_DEPARTMENTS = [
  { id: "default-department", name: "Administração" },
  { id: "dept-admin", name: "Administração" },
  { id: "dept-comercial", name: "Comercial" },
  { id: "dept-contabil", name: "Contabil" },
  { id: "dept-financeiro", name: "Financeiro" },
  { id: "dept-fiscal", name: "Fiscal" },
  { id: "dept-pessoal", name: "Pessoal" },
  { id: "dept-rh", name: "Recursos Humanos" },
  { id: "dept-ti", name: "Tecnologia" },
] as const;

export const CREATE_USER_PERMISSION_OPTIONS: Array<{ value: PermissionLevel; label: string }> = [
  { value: 0, label: "Sem acesso" },
  { value: 1, label: "Visualizador" },
  { value: 2, label: "Usuário" },
  { value: 3, label: "Administrador" },
];

export const CREATE_USER_MODULE_OPTIONS = [
  { key: "certificado", label: "Certificado" },
  { key: "comercial", label: "Comercial" },
  { key: "contabil", label: "Contábil" },
  { key: "financeiro", label: "Financeiro" },
  { key: "fiscal", label: "Fiscal" },
  { key: "integracao", label: "Integração" },
  { key: "marketing", label: "Marketing" },
  { key: "parcelamento", label: "Parcelamento" },
  { key: "pessoal", label: "Pessoal" },
  { key: "regularize", label: "Regularize" },
  { key: "rh", label: "RH" },
  { key: "ti", label: "Tecnologia" },
  { key: "triagem", label: "Triagem" },
] as const;
