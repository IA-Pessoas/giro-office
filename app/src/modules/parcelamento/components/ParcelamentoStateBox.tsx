import type { LucideIcon } from "lucide-react";

interface ParcelamentoStateBoxProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "info" | "warning" | "error";
}

const toneClassNames = {
  info: "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100",
  error:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-100",
};

export function ParcelamentoStateBox({
  icon: Icon,
  title,
  description,
  tone = "info",
}: ParcelamentoStateBoxProps) {
  return (
    <section className={`rounded-xl border p-5 ${toneClassNames[tone]}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/70 text-current dark:bg-white/10">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm opacity-80">{description}</p>
        </div>
      </div>
    </section>
  );
}
