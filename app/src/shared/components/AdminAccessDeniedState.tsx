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
    <section className="admin-access-denied">
      <div className="admin-access-denied__glow" aria-hidden="true">
        <div className="admin-access-denied__orb admin-access-denied__orb--top" />
        <div className="admin-access-denied__orb admin-access-denied__orb--bottom" />
      </div>

      <div className="admin-access-denied__content">
        <div className="flex items-start gap-4">
          <div className="admin-access-denied__icon">
            <ShieldAlert className="h-6 w-6" />
          </div>

          <div className="space-y-2">
            <div className="admin-access-denied__badge">Área restrita</div>

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

        <Link href="/dashboard" className="admin-access-denied__action">
          <ArrowLeft className="h-4 w-4" />
          Voltar para o dashboard
        </Link>
      </div>
    </section>
  );
}
