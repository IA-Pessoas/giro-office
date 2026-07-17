import type { LucideIcon } from "lucide-react";

interface PessoalPlaceholderSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  requiresClient?: boolean;
  hasClient?: boolean;
}

export function PessoalPlaceholderSection({
  icon: Icon,
  title,
  description,
  requiresClient = false,
  hasClient = true,
}: PessoalPlaceholderSectionProps) {
  const message =
    requiresClient && !hasClient ? "Selecione um cliente para continuar." : description;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{message}</p>
          {requiresClient && !hasClient ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
              Folha, Obrigações, Senhas e Acompanhamentos dependem de um cliente.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
