import { ShieldAlert } from "lucide-react";

interface AccessDeniedPanelProps {
  title?: string;
  description?: string;
}

export function AccessDeniedPanel({
  title = "Acesso negado ao módulo contábil",
  description = "Você não possui permissão para visualizar este fluxo no momento.",
}: AccessDeniedPanelProps) {
  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-amber-600 dark:bg-slate-900/80 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">{title}</h2>
          <p className="max-w-2xl text-sm leading-6 text-amber-800 dark:text-amber-200">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
}
