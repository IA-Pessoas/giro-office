export function RhPointAdjustmentPanel() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Ajustes de ponto
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Solicitações pendentes e histórico de ajustes aparecerão aqui.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
        Nenhum ajuste carregado nesta etapa.
      </div>
    </div>
  );
}
