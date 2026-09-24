import type { ContabilCompetence } from "../types";
import { CONTABIL_MONTH_OPTIONS, getContabilCompetenceYears } from "./contabilControlSection.helpers";

const SELECT_CLASS =
  "h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

export function ContabilCompetenceSelect({
  value,
  onChange,
  label = "Competência",
  disabled = false,
}: {
  value: ContabilCompetence;
  onChange: (value: ContabilCompetence) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [year, month] = value.split("-");

  return (
    <span role="group" aria-label={label} className="inline-flex items-center gap-2">
      <select
        aria-label={`${label} (mês)`}
        value={month}
        disabled={disabled}
        onChange={(event) => onChange(`${year}-${event.target.value}` as ContabilCompetence)}
        className={SELECT_CLASS}
      >
        {CONTABIL_MONTH_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} (ano)`}
        value={year}
        disabled={disabled}
        onChange={(event) => onChange(`${event.target.value}-${month}` as ContabilCompetence)}
        className={SELECT_CLASS}
      >
        {getContabilCompetenceYears(value).map((option) => (
          <option key={option} value={String(option)}>
            {option}
          </option>
        ))}
      </select>
    </span>
  );
}
