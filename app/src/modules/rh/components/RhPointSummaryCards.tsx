const CARD_TITLES = [
  "Horas trabalhadas",
  "Saldo do mês",
  "Horas extras",
  "Ajustes pendentes",
];

export function RhPointSummaryCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {CARD_TITLES.map((title) => (
        <div
          key={title}
          className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <div className="mt-3 rounded-lg border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Dados mensais serão exibidos aqui.
          </div>
        </div>
      ))}
    </div>
  );
}
