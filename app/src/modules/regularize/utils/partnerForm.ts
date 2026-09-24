export type PartnerFormField = "pf_id" | "part" | "entry" | "exit";
export type PartnerFormErrors = Partial<Record<PartnerFormField, string>>;

// Mensagens iguais às do backend (services/regularize-service/src/schemas/partners.schemas.ts).
const PART_RANGE_MESSAGE = "Participação deve ser maior que 0% e no máximo 100%.";
const incompleteDate = (label: string) => `Informe a data de ${label} completa (dd/mm/aaaa).`;

// `*Incomplete` vem do `validity.badInput` do <input type="date">: data digitada pela metade chega como "".
export function validatePartnerForm(
  values: { pf_id: string; part: string; entry: string; exit: string },
  dates: { entryIncomplete?: boolean; exitIncomplete?: boolean } = {},
): PartnerFormErrors {
  const errors: PartnerFormErrors = {};
  const part = Number(values.part);

  if (!values.pf_id) errors.pf_id = "Selecione a pessoa física.";

  if (!values.part.trim() || Number.isNaN(part)) errors.part = "Informe a participação em %.";
  else if (part <= 0 || part > 100) errors.part = PART_RANGE_MESSAGE;

  if (dates.entryIncomplete || !values.entry) errors.entry = incompleteDate("entrada");
  if (dates.exitIncomplete) errors.exit = incompleteDate("saída");
  else if (values.entry && values.exit && values.exit < values.entry)
    errors.exit = "Data de saída não pode ser anterior à entrada.";

  return errors;
}
