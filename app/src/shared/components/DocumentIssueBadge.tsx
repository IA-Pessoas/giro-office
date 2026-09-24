import { AlertTriangle } from "lucide-react";

import { getDocumentIssue } from "../utils/documentIssue";
import { StatusBadge } from "./StatusBadge";

// Pendência de revisão para CPF/CNPJ gravado inválido ou mascarado (#1375).
export function DocumentIssueBadge({ value }: { value: string | null | undefined }) {
  const issue = getDocumentIssue(value);
  if (!issue) {
    return null;
  }

  return (
    <span className="mt-1 block">
      <StatusBadge
        size="sm"
        config={{
          label: `Revisar documento: ${issue.toLowerCase()}`,
          variant: "warning",
          icon: AlertTriangle,
        }}
      />
    </span>
  );
}
