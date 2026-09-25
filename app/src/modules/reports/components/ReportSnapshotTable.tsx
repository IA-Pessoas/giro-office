import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PaginationControls } from "@shared/components";
import { StatusBadge } from "@shared/components/StatusBadge";

import { useReportSnapshot } from "../hooks/useReports";
import type { ReportHistoryItem, ReportHistoryScope } from "../types/report.types";
import { formatReportDate, getReportStatusConfig, panelClassName } from "./reportUi";
import { ReportDownloadActions } from "./ReportDownloadActions";
import { ReportResultBlocks } from "./ReportResultBlocks";

export function ReportSnapshotTable({
  job,
  scope,
  onClose,
}: {
  job: ReportHistoryItem;
  scope: ReportHistoryScope;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<Array<number | undefined>>([]);
  const snapshotQuery = useReportSnapshot(job.id, scope, cursor);
  const sectionRef = useRef<HTMLElement>(null);
  // O snapshot abre abaixo da tabela; leva o usuário até ele.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    sectionRef.current?.focus({ preventScroll: true });
  }, [job.id]);
  const snapshotId = snapshotQuery.data?.snapshot.id;
  const rows = snapshotQuery.data?.rows ?? [];
  const blocks = snapshotQuery.data?.blocks;
  const visibleBlockRows = blocks?.reduce((total, block) => total + block.rows.length, 0) ?? 0;
  const totalBlockRows = blocks?.reduce((total, block) => total + block.rowCount, 0) ?? 0;
  const headers = rows.length > 0 ? Object.keys(rows[0]?.values ?? {}) : [];

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className={`${panelClassName} mt-5`}
      aria-labelledby="report-snapshot-title"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="report-snapshot-title" className="font-semibold text-gray-900 dark:text-white">
            Snapshot: {job.model_name ?? "Relatório"}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Somente leitura · criado em {formatReportDate(snapshotQuery.data?.snapshot.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {snapshotId ? <ReportDownloadActions id={snapshotId} /> : null}
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            Fechar
          </button>
        </div>
      </div>
      {snapshotQuery.isPending ? (
        <div className="flex items-center gap-3 py-8 text-sm text-gray-600 dark:text-slate-400" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando snapshot...
        </div>
      ) : snapshotQuery.isError ? (
        <p role="alert" className="py-5 text-sm text-red-600 dark:text-red-400">Não foi possível carregar o snapshot.</p>
      ) : blocks ? (
        <>
          <ReportResultBlocks blocks={blocks} snapshot />
          <PaginationControls
            page={page}
            limit={100}
            total={totalBlockRows}
            count={visibleBlockRows}
            hasMore={Boolean(snapshotQuery.data?.nextCursor)}
            isFetching={snapshotQuery.isFetching}
            onPrevious={() => {
              const nextStack = [...cursorStack];
              const previousCursor = nextStack.pop();
              setCursorStack(nextStack);
              setCursor(previousCursor);
              setPage((current) => Math.max(1, current - 1));
            }}
            onNext={() => {
              if (snapshotQuery.data?.nextCursor === null || snapshotQuery.data?.nextCursor === undefined) return;
              setCursorStack((current) => [...current, cursor]);
              setCursor(snapshotQuery.data.nextCursor);
              setPage((current) => current + 1);
            }}
          />
        </>
      ) : rows.length === 0 ? (
        <p className="py-5 text-sm text-gray-600 dark:text-slate-400" role="status">O snapshot não possui linhas.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-700">
              <caption className="sr-only">Tabela paginada do snapshot do relatório</caption>
              <thead className="bg-gray-50 dark:bg-gray-800/70">
                <tr><th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">#</th>{headers.map((header) => <th key={header} scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">{header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((row) => <tr key={row.row_number}><td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{row.row_number}</td>{headers.map((header) => <td key={header} className="px-4 py-3 text-gray-700 dark:text-gray-200">{String(row.values[header] ?? "—")}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={page}
            limit={rows.length}
            total={rows.length}
            count={rows.length}
            hasMore={Boolean(snapshotQuery.data?.nextCursor)}
            isFetching={snapshotQuery.isFetching}
            onPrevious={() => {
              const nextStack = [...cursorStack];
              const previousCursor = nextStack.pop();
              setCursorStack(nextStack);
              setCursor(previousCursor);
              setPage((current) => Math.max(1, current - 1));
            }}
            onNext={() => {
              if (snapshotQuery.data?.nextCursor === null || snapshotQuery.data?.nextCursor === undefined) return;
              setCursorStack((current) => [...current, cursor]);
              setCursor(snapshotQuery.data.nextCursor);
              setPage((current) => current + 1);
            }}
          />
        </>
      )}
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-500">
        <StatusBadge config={getReportStatusConfig(job.status)} size="sm" />
        Estado do job preservado junto ao snapshot.
      </div>
    </section>
  );
}
