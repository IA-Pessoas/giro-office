import type { ContabilRelationship } from "../types";

type ContabilRelationshipField = Exclude<keyof ContabilRelationship, "id" | "client_id" | "created_at" | "updated_at">;

interface ContabilRelationshipFieldDefinition {
  field: ContabilRelationshipField;
  label: string;
  kind: "state" | "text" | "textarea";
  requiredOnCreate: boolean;
  order: number;
}

export const CONTABIL_RELATIONSHIP_FIELDS: ContabilRelationshipFieldDefinition[] = [
  {
    field: "chart_accounts",
    label: "Plano de contas",
    kind: "state",
    requiredOnCreate: false,
    order: 1,
  },
  {
    field: "tool",
    label: "Ferramenta",
    kind: "text",
    requiredOnCreate: true,
    order: 2,
  },
  {
    field: "system",
    label: "Sistema",
    kind: "text",
    requiredOnCreate: true,
    order: 3,
  },
  {
    field: "bidding",
    label: "Participa de licitação",
    kind: "state",
    requiredOnCreate: false,
    order: 4,
  },
  {
    field: "note",
    label: "Observações",
    kind: "textarea",
    requiredOnCreate: true,
    order: 5,
  },
];

export const CONTABIL_RELATIONSHIP_TEXTAREA_FIELDS = CONTABIL_RELATIONSHIP_FIELDS.filter(
  (field): field is ContabilRelationshipFieldDefinition & { field: "note"; kind: "textarea" } =>
    field.kind === "textarea",
);

export function getContabilRelationshipFieldLabel(field: string) {
  return CONTABIL_RELATIONSHIP_FIELDS.find((definition) => definition.field === field)?.label ?? field;
}
