import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";

import {
  DEPARTMENT_COLOR_PRESETS,
  DEPARTMENT_PRIMARY_COLOR_COUNT,
} from "../utils/colors";

interface DepartmentColorFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  labelClassName?: string;
  containerClassName?: string;
}

const PRESET_SWATCH_CLASSNAMES: Record<string, string> = {
  "#2563eb": "bg-blue-600",
  "#059669": "bg-emerald-600",
  "#facc15": "bg-yellow-400",
  "#f97316": "bg-orange-500",
  "#dc2626": "bg-red-600",
  "#7c3aed": "bg-violet-600",
  "#111827": "bg-slate-900",
  "#475569": "bg-slate-600",
  "#06b6d4": "bg-cyan-500",
  "#14b8a6": "bg-teal-500",
  "#84cc16": "bg-lime-500",
  "#ec4899": "bg-pink-500",
  "#4f46e5": "bg-indigo-600",
  "#64748b": "bg-slate-500",
  "#ea580c": "bg-orange-600",
  "#000000": "bg-black",
  "#0f766e": "bg-teal-700",
  "#8b5cf6": "bg-violet-500",
  "#f43f5e": "bg-rose-500",
  "#94a3b8": "bg-slate-400",
};

function normalizeColor(color: string): string {
  return color.trim().toLowerCase();
}

function DepartmentColorSwatch({
  color,
  label,
  isSelected,
  onClick,
}: {
  color: string;
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const swatchClassName = PRESET_SWATCH_CLASSNAMES[normalizeColor(color)] ?? "bg-slate-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-7 w-7 rounded-full transition-all ${
        isSelected ? "scale-105 ring-4 ring-[var(--colors-brand-gradient-start)]/16" : "hover:scale-105"
      }`}
      aria-label={`Selecionar cor ${label}`}
      title={label}
    >
      <span
        className={`absolute inset-0 rounded-full border ${
          isSelected
            ? "border-slate-900 dark:border-white"
            : "border-slate-400/30 dark:border-slate-500/40"
        } ${swatchClassName}`}
      />
      {isSelected ? (
        <Check className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
      ) : null}
    </button>
  );
}

export function DepartmentColorField({
  value,
  onChange,
  labelClassName = "text-sm font-medium text-slate-700 dark:text-slate-200",
  containerClassName = "flex h-13 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-900",
}: DepartmentColorFieldProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const normalizedValue = normalizeColor(value);

  const primaryColors = useMemo(
    () => DEPARTMENT_COLOR_PRESETS.slice(0, DEPARTMENT_PRIMARY_COLOR_COUNT),
    [],
  );
  const extraColors = useMemo(
    () => DEPARTMENT_COLOR_PRESETS.slice(DEPARTMENT_PRIMARY_COLOR_COUNT),
    [],
  );
  const extraColorRows = useMemo(() => {
    const rows: Array<typeof extraColors> = [];

    for (let index = 0; index < extraColors.length; index += 6) {
      rows.push(extraColors.slice(index, index + 6));
    }

    return rows;
  }, [extraColors]);
  const selectedExtraColor = extraColors.find(
    (preset) => normalizeColor(preset.value) === normalizedValue,
  );
  const hasExtraColors = extraColors.length > 0;

  return (
    <div className="space-y-2">
      <span className={labelClassName}>Cor</span>

      <div className="relative">
        <div className={containerClassName}>
          <div className="flex items-center gap-2">
            {primaryColors.map((preset) => (
              <DepartmentColorSwatch
                key={preset.value}
                color={preset.value}
                label={preset.label}
                isSelected={normalizedValue === normalizeColor(preset.value)}
                onClick={() => {
                  onChange(preset.value);
                  setIsExpanded(false);
                }}
              />
            ))}

            {hasExtraColors ? (
              <button
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
                className={`ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                  isExpanded || selectedExtraColor
                    ? "border-[var(--colors-brand-gradient-end)] bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
                }`}
                aria-label="Mostrar mais cores"
                title="Mais cores"
              >
                {selectedExtraColor && !isExpanded ? (
                  <span
                    className={`h-3.5 w-3.5 rounded-full ${PRESET_SWATCH_CLASSNAMES[normalizeColor(selectedExtraColor.value)]}`}
                  />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
              </button>
            ) : null}
          </div>
        </div>

        {hasExtraColors && isExpanded ? (
          <div className="absolute right-0 top-[calc(100%+0.375rem)] z-30 w-fit rounded-2xl border border-slate-700 bg-slate-900 p-3 text-white shadow-2xl shadow-slate-950/30">
            <div className="mb-3 text-sm font-semibold text-white">Mais cores</div>

            <div className="space-y-2.5">
              {extraColorRows.map((row, rowIndex) => (
                <div key={`color-row-${rowIndex}`} className="flex items-center justify-start gap-2.5">
                  {row.map((preset) => (
                    <DepartmentColorSwatch
                      key={preset.value}
                      color={preset.value}
                      label={preset.label}
                      isSelected={normalizedValue === normalizeColor(preset.value)}
                      onClick={() => {
                        onChange(preset.value);
                        setIsExpanded(false);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
