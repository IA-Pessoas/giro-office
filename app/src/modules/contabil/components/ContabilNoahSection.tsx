import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, FileArchive } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@shared/ui/newLayout/input";
import { contabilNoahService } from "../services/contabilNoahService";
import { getContabilErrorMessage } from "../services/contabilError";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";

export function ContabilNoahSection({ canEdit }: { canEdit: boolean }) {
  const { user } = useAuth();
  return <NoahForm key={user?.organization_id} canEdit={canEdit} />;
}

function NoahForm({ canEdit }: { canEdit: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const conversion = useMutation({ mutationFn: contabilNoahService.convert });
  const download = useMutation({
    mutationFn: async (id: string) => {
      const blob = await contabilNoahService.download(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `NOAH-${id}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const fileError =
    file && (!/\.zip$/iu.test(file.name) || file.size > 5 * 1024 * 1024)
      ? "Selecione um ZIP de até 5 MiB."
      : null;
  const result = conversion.data;
  const error =
    fileError ??
    (conversion.error
      ? getContabilErrorMessage(conversion.error)
      : download.error
        ? getContabilErrorMessage(download.error)
        : null);

  return (
    <section className="space-y-5" aria-label="Conversão Noah" aria-busy={conversion.isPending}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Conversão Noah</h2>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          Converta comprovantes HTML de um ZIP em CSV com fornecedor, data, valor e arquivo.
        </p>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          Até 5 MiB e 100 entradas por ZIP.
        </p>
      </div>
      {!canEdit && (
        <p className="text-sm text-gray-600 dark:text-slate-400">
          É necessária permissão de edição no Contábil para converter.
        </p>
      )}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (file && canEdit && !fileError && !conversion.isPending) conversion.mutate(file);
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <label
            htmlFor="noah-zip"
            className="text-sm font-medium text-gray-700 dark:text-slate-300"
          >
            Arquivo ZIP Noah
          </label>
          <Input
            id="noah-zip"
            type="file"
            accept=".zip,application/zip"
            disabled={!canEdit || conversion.isPending}
            aria-invalid={Boolean(fileError)}
            aria-describedby={error ? "noah-error" : undefined}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              conversion.reset();
              download.reset();
            }}
          />
        </div>
        <button
          className={CONTABIL_OUTLINE_ACTION_CLASS}
          type="submit"
          disabled={!canEdit || !file || Boolean(fileError) || conversion.isPending}
        >
          <FileArchive className="h-4 w-4" aria-hidden="true" />
          {conversion.isPending ? "Convertendo..." : "Converter ZIP"}
        </button>
      </form>
      {error && (
        <p id="noah-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-4">
          <p role="status" className="text-sm text-gray-700 dark:text-slate-300">
            {result.row_count} pagamentos extraídos de {result.file_count} arquivos.{" "}
            {result.rejections.length} arquivos rejeitados.
          </p>
          {result.rejections.length > 0 && (
            <ul
              aria-label="Arquivos rejeitados"
              className="space-y-2 text-sm text-gray-700 dark:text-slate-300"
            >
              {result.rejections.map((rejection, index) => (
                <li key={`${index}-${rejection.file}`} className="break-words">
                  <strong>{rejection.file}</strong>: {rejection.reason}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className={CONTABIL_OUTLINE_ACTION_CLASS}
            disabled={!result.row_count || download.isPending}
            onClick={() => download.mutate(result.id)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {download.isPending ? "Baixando..." : "Baixar CSV"}
          </button>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Conversão registrada em {new Date(result.created_at).toLocaleString("pt-BR")}. O
            resultado foi salvo para auditoria.
          </p>
        </div>
      )}
    </section>
  );
}
