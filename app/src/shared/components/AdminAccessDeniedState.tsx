import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

interface AdminAccessDeniedStateProps {
  title?: string;
  description?: string;
}

export function AdminAccessDeniedState({
  title = "Você não tem acesso a esta área",
  description = "Se precisar continuar, solicite acesso a um administrador responsável.",
}: AdminAccessDeniedStateProps) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-blue-400/12 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_34%),linear-gradient(180deg,_rgba(15,23,42,0.98)_0%,_rgba(2,6,23,1)_100%)] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.42)] sm:p-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-4rem] top-[-3rem] h-40 w-40 rounded-full bg-blue-400/12 blur-3xl" />
        <div className="absolute bottom-[-5rem] left-[-3rem] h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-300/18 bg-blue-400/10 text-blue-100 shadow-[0_12px_30px_rgba(59,130,246,0.14)]">
            <ShieldAlert className="h-6 w-6" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-blue-300/15 bg-blue-300/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/85">
              Área restrita
            </div>

            <div className="space-y-2">
              <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                {title}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-[15px]">
                {description}
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium text-slate-100 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para o dashboard
        </Link>
      </div>
    </section>
  );
}
