import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@shared/services/toast";

import { useDownloadReportMutation } from "../hooks/useReports";
import type { ReportExportFormat } from "../types/report.types";

const formats: Array<{ value: ReportExportFormat; label: string; icon: typeof FileText }> = [
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "csv", label: "CSV", icon: FileSpreadsheet },
  { value: "xlsx", label: "XLSX", icon: FileSpreadsheet },
];

export function ReportDownloadActions({ id, disabled = false }: { id: string; disabled?: boolean }) {
  const downloadMutation = useDownloadReportMutation();
  const [activeFormat, setActiveFormat] = useState<ReportExportFormat | null>(null);
  const activeLabel = formats.find((format) => format.value === activeFormat)?.label;

  async function handleDownload(format: ReportExportFormat) {
    setActiveFormat(format);
    try {
      const result = await downloadMutation.mutateAsync({ id, format });
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      toast.success(`${format.toUpperCase()} pronto para download.`);
    } catch {
      toast.error("Não foi possível preparar o download.");
    } finally {
      setActiveFormat(null);
    }
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      aria-busy={downloadMutation.isPending}
      aria-label="Downloads do relatório"
    >
      {downloadMutation.isPending && activeLabel ? (
        <span className="sr-only" role="status">
          Preparando download em {activeLabel}...
        </span>
      ) : null}
      {formats.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={`Baixar resultado em ${label}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          disabled={disabled || downloadMutation.isPending}
          onClick={() => void handleDownload(value)}
        >
          {activeFormat === value ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {label}
          <Download className="h-3 w-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
