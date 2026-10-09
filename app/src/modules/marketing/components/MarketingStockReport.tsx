import { useState } from "react";
import { Download, Package, Printer } from "lucide-react";

import { Dialog } from "@shared/components";

import { useMarketingStock } from "../hooks/useMarketingDashboard";
import type { MarketingStock } from "../types/marketingDashboard";
import {
  createMarketingStockCsv,
  downloadCsvFile,
  MARKETING_STOCK_COLUMNS,
  marketingStockRows,
} from "../utils/marketingCsv";
import { printMarketingReport } from "../utils/printMarketingReport";
import { marketingPrimaryButtonClass, marketingSecondaryButtonClass } from "./marketingButtonStyles";
import { MarketingReportTable } from "./MarketingReportTable";

function StockReportContent({ stock }: { stock: MarketingStock }) {
  return (
    <article
      aria-label={`Estoque do departamento ${stock.department.name}`}
      className="space-y-6 text-gray-900 dark:text-slate-100"
      id="marketing-stock-report"
    >
      <div className="hide-on-print flex flex-wrap justify-end gap-2">
        <button
          className={marketingSecondaryButtonClass}
          disabled={stock.items.length === 0}
          onClick={() => downloadCsvFile("estoque-marketing.csv", createMarketingStockCsv(stock.items))}
          type="button"
        >
          <Download aria-hidden="true" className="mr-1.5 inline h-4 w-4" />
          Exportar CSV
        </button>
        <button
          className={marketingPrimaryButtonClass}
          onClick={() => printMarketingReport("marketing-stock-report")}
          type="button"
        >
          <Printer aria-hidden="true" className="h-4 w-4" />
          Imprimir relatório
        </button>
      </div>

      <header className="border-b border-gray-200 pb-4 dark:border-slate-700">
        <p className="text-sm text-gray-600 dark:text-slate-300">Relatório de estoque</p>
        <h2 className="text-xl font-semibold">Departamento {stock.department.name}</h2>
        <p className="text-sm text-gray-700 dark:text-slate-200">
          {stock.totals.items} {stock.totals.items === 1 ? "item" : "itens"} · {stock.totals.quantity}{" "}
          {stock.totals.quantity === 1 ? "unidade" : "unidades"} em estoque
        </p>
      </header>

      <MarketingReportTable
        columns={MARKETING_STOCK_COLUMNS}
        emptyMessage="Nenhum item ativo no estoque do Marketing."
        ids={stock.items.map((item) => item.id)}
        rows={marketingStockRows(stock.items)}
        title="Itens"
      />
    </article>
  );
}

export function MarketingStockReport() {
  const [open, setOpen] = useState(false);
  const query = useMarketingStock(open);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center gap-2">
        <Package aria-hidden="true" className="h-4 w-4 text-blue-600 dark:text-blue-300" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Estoque do Marketing</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Itens do departamento Marketing com quantidade e últimas movimentações. Somente consulta.
          </p>
        </div>
      </div>
      <button className={marketingPrimaryButtonClass} onClick={() => setOpen(true)} type="button">
        Abrir relatório
      </button>

      <Dialog
        contentClassName="w-[min(96vw,900px)]"
        description="Estoque canônico do departamento Marketing"
        onOpenChange={setOpen}
        open={open}
        title="Estoque do Marketing"
      >
        {query.isLoading ? (
          <p className="text-sm text-gray-600 dark:text-slate-300" role="status">Carregando estoque…</p>
        ) : null}
        {query.isError ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-red-700 dark:text-red-300">
              Não foi possível carregar o estoque. Confira se o departamento Marketing existe no cadastro.
            </p>
            <button className={marketingSecondaryButtonClass} onClick={() => void query.refetch()} type="button">
              Tentar novamente
            </button>
          </div>
        ) : null}
        {query.data ? <StockReportContent stock={query.data} /> : null}
      </Dialog>
    </section>
  );
}
