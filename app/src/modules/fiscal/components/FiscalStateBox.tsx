import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface FiscalStateBoxProps {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
  tone?: "neutral" | "danger" | "loading";
  compact?: boolean;
}

export function FiscalStateBox({
  children,
  icon: Icon,
  title,
  tone = "neutral",
  compact = false,
}: FiscalStateBoxProps) {
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300"
      : "border-dashed border-gray-200 bg-gray-50/70 text-gray-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300";

  return (
    <div className={`rounded-2xl border ${compact ? "p-4" : "p-5"} ${className}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-slate-800/80">
          <Icon className={`h-4 w-4 ${tone === "loading" ? "animate-spin" : ""}`} />
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6">{children}</p>
        </div>
      </div>
    </div>
  );
}
