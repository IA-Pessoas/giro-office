import type { ContabilRelationship } from "../types";

type ContabilRelationshipField = Exclude<keyof ContabilRelationship, "id" | "client_id" | "created_at" | "updated_at">;

interface ContabilRelationshipFieldDefinition {
  field: ContabilRelationshipField;
  label: string;
  kind: "boolean" | "text" | "textarea";
  requiredOnCreate: boolean;
  order: number;
}

export const CONTABIL_RELATIONSHIP_FIELDS: ContabilRelationshipFieldDefinition[] = [
  {
    field: "bidding",
    label: "Participa de licitação",
    kind: "boolean",
    requiredOnCreate: true,
    order: 1,
  },
  {
    field: "chart_accounts",
    label: "Plano de contas",
    kind: "text",
    requiredOnCreate: true,
    order: 2,
  },
  {
    field: "tool",
    label: "Ferramenta",
    kind: "text",
    requiredOnCreate: true,
    order: 3,
  },
  {
    field: "system",
    label: "Sistema",
    kind: "text",
    requiredOnCreate: true,
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

export const CONTABIL_RELATIONSHIP_BOOLEAN_FIELDS = CONTABIL_RELATIONSHIP_FIELDS.filter(
  (field): field is ContabilRelationshipFieldDefinition & { field: "bidding"; kind: "boolean" } =>
    field.kind === "boolean",
);

export const CONTABIL_RELATIONSHIP_TEXT_FIELDS = CONTABIL_RELATIONSHIP_FIELDS.filter(
  (
    field,
  ): field is ContabilRelationshipFieldDefinition & {
    field: "chart_accounts" | "tool" | "system";
    kind: "text";
  } => field.kind === "text",
);

export const CONTABIL_RELATIONSHIP_TEXTAREA_FIELDS = CONTABIL_RELATIONSHIP_FIELDS.filter(
  (field): field is ContabilRelationshipFieldDefinition & { field: "note"; kind: "textarea" } =>
    field.kind === "textarea",
);
