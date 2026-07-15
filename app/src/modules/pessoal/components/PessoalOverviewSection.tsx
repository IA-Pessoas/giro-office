import {
  CheckSquare,
  ClipboardList,
  Landmark,
  UserRoundCog,
  WalletCards,
} from "lucide-react";

import { usePessoalUnions } from "../hooks/usePessoalUnions";

function formatCount(value: number, isLoading: boolean) {
  return isLoading ? "..." : String(value);
}

export function PessoalOverviewSection() {
  const { data: unions = [], isError, isLoading } = usePessoalUnions();
  const withBaseDateCount = unions.filter((union) => Boolean(union.base_date)).length;
  const withoutBaseDateCount = unions.length - withBaseDateCount;
  const cnpjCount = unions.filter((union) => Boolean(union.cnpj)).length;
  const featureCards = [
    {
      label: "Sindicatos",
      value: formatCount(unions.length, isLoading),
      description: "Cadastros recebidos para folha e data-base.",
      details: [
        `${formatCount(withBaseDateCount, isLoading)} com data-base`,
        `${formatCount(withoutBaseDateCount, isLoading)} sem data-base`,
        `${formatCount(cnpjCount, isLoading)} CNPJs cadastrados`,
      ],
      icon: Landmark,
      tone: "blue",
    },
    {
      label: "Folha",
      description: "Rotinas por cliente e competência.",
      icon: WalletCards,
      tone: "gray",
      details: [],
    },
    {
      label: "Obrigações",
      description: "Geração e conferência mensal.",
      icon: CheckSquare,
      tone: "gray",
      details: [],
    },
    {
      label: "Acompanhamentos",
      description: "LDD e situacoes do modulo.",
      icon: ClipboardList,
      tone: "gray",
      details: [],
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="relative min-h-[320px] overflow-hidden rounded-xl border border-blue-500/40 bg-gradient-to-br from-blue-700 via-sky-700 to-blue-800 p-6 text-white shadow-lg">
        <div className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
          <UserRoundCog className="h-6 w-6" />
        </div>

        <div className="flex min-h-[270px] max-w-xl flex-col justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">
              Resumo operacional
            </p>
            <h2 className="mt-5 max-w-lg text-4xl font-bold leading-tight">
              Departamento Pessoal
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-blue-100">
              Rotinas de folha, obrigações, sindicatos, acompanhamentos e acessos no mesmo fluxo.
            </p>
          </div>
        </div>

        {isError ? (
          <p className="mt-5 rounded-lg bg-white/15 px-3 py-2 text-sm text-white">
            Não foi possível carregar os indicadores de sindicatos agora.
          </p>
        ) : null}
      </div>

      <div className="grid gap-5">
        {featureCards.map((card) => {
          const Icon = card.icon;
          const isPrimary = card.tone === "blue";

          return (
            <div
              key={card.label}
              className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    isPrimary
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {card.label}
                    </p>
                    {card.value ? (
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {card.value}
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {card.description}
                  </p>
                  {card.details.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.details.map((detail) => (
                        <span
                          key={detail}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        >
                          {detail}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
