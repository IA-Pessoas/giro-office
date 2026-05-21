import type { LucideIcon } from "lucide-react";

export function FiscalPlaceholderSection({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white px-6 py-8 shadow-[0_18px_48px_-30px_rgba(15,23,42,0.22)] dark:border-slate-700 dark:bg-slate-900 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            <Icon className="h-5 w-5" />
          </div>

          <div className="space-y-3">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Em breve
            </span>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {title}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:border dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-medium text-slate-950 dark:text-white">Estrutura pronta</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              A aba já nasce isolada para receber seus próprios hooks e queries.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:border dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-medium text-slate-950 dark:text-white">Sem requests automáticos</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Nenhuma consulta é disparada enquanto a fundação visual é montada.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:border dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-medium text-slate-950 dark:text-white">Pronta para evoluir</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Filtros, tabelas e formulários entram nas próximas PRs sem retrabalho estrutural.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
