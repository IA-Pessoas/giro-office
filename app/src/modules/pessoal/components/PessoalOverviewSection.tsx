import { Building2, CheckSquare, KeyRound, Landmark } from "lucide-react";

const overviewCards = [
  { label: "Sindicatos", value: "Aguardando integracao", icon: Landmark },
  { label: "Folha", value: "Aguardando cliente", icon: Building2 },
  { label: "Obrigacoes", value: "Aguardando competencia", icon: CheckSquare },
  { label: "Senhas", value: "Integracao sensivel futura", icon: KeyRound },
];

export function PessoalOverviewSection() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {overviewCards.map((card) => {
        const Icon = card.icon;

        return (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <Icon className="h-5 w-5 text-pink-600 dark:text-pink-300" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {card.value}
            </p>
          </div>
        );
      })}
    </section>
  );
}
