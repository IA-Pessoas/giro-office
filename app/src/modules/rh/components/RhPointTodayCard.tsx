interface RhPointTodayCardProps {
  currentUserName: string;
}

export function RhPointTodayCard({ currentUserName }: RhPointTodayCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Meu ponto hoje
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cartão do dia do usuário autenticado.
          </p>
        </div>
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {currentUserName}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
        O estado do ponto de hoje será exibido aqui.
      </div>
    </div>
  );
}
