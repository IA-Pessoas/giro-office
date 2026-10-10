import { formatDateTime } from "@shared/utils/dateFormat";
import { useState } from "react";

import {
  useImportRegularizeDteMutation,
  useRegularizeDteImports,
} from "../hooks/useRegularizeOperations";
import type {
  RegularizeDteImport,
  RegularizeDteImportFormat,
  RegularizeDteRejectionReason,
} from "../types";
import { getRegularizeMutationErrorMessage } from "../utils/regularizeForm";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import {
  regularizePanelClassName,
  regularizePrimaryButtonClassName,
  regularizeTextareaClassName,
} from "./regularizeFormControls";

// Mesmo teto do serviço (DTE_IMPORT_LIMITS.maxContentLength).
const MAX_CONTENT_LENGTH = 400_000;

const REJECTION_LABELS: Record<RegularizeDteRejectionReason, string> = {
  LINHA_INCOMPLETA: "linha com menos de cinco células",
  ITEM_INVALIDO: "item que não é um aviso",
  CAMPO_INVALIDO: "campo com valor inválido",
  CAMPO_LONGO: "campo longo demais",
  SEM_DADOS: "linha sem dados",
};

function ImportSummary({ item }: { item: RegularizeDteImport }) {
  return (
    <span>
      {item.total_rows} lidas · {item.created_count} novas · {item.duplicate_count} repetidas ·{" "}
      {item.rejected_count} recusadas
    </span>
  );
}

function ImportDetails({ item }: { item: RegularizeDteImport }) {
  if (!item.rejections.length && !item.duplicates.length) return null;

  return (
    <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
      {item.rejections.map((rejection) => (
        <li key={`r${rejection.row}`}>
          Linha {rejection.row}: recusada, {REJECTION_LABELS[rejection.reason] ?? rejection.reason}.
        </li>
      ))}
      {item.duplicates.map((duplicate) => (
        <li key={`d${duplicate.row}`}>
          Linha {duplicate.row}: já importada ({duplicate.aviso || "sem aviso"} ·{" "}
          {duplicate.cnpj_cpf || "sem CNPJ/CPF"}).
        </li>
      ))}
    </ul>
  );
}

// Importação manual de avisos DTE (#1744): a pessoa cola o HTML ou o JSON do portal e o
// serviço extrai os avisos. O conteúdo vai como texto e nunca é renderizado aqui.
export function RegularizeDtePanel({ canEdit }: { canEdit: boolean }) {
  const [format, setFormat] = useState<RegularizeDteImportFormat>("html");
  const [content, setContent] = useState("");
  const importMutation = useImportRegularizeDteMutation();
  const importsQuery = useRegularizeDteImports();
  const imports = importsQuery.data?.data ?? [];
  const tooLong = content.length > MAX_CONTENT_LENGTH;

  async function submit() {
    try {
      await importMutation.mutateAsync({ format, content });
      setContent("");
    } catch {
      // O erro aparece pelo estado da mutation.
    }
  }

  return (
    <div className="space-y-4">
      <section className={regularizePanelClassName}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Importar avisos DTE
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Cole o HTML da página de avisos ou o JSON exportado. Avisos já importados não são
          duplicados. A leitura foi validada apenas com exemplos sintéticos do sistema anterior:
          confira o resultado de cada importação.
        </p>

        {canEdit ? (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Formato
              <RegularizeNativeSelect
                className="mt-1.5 sm:w-48"
                value={format}
                onChange={(event) => setFormat(event.target.value as RegularizeDteImportFormat)}
                disabled={importMutation.isPending}
              >
                <option value="html">HTML</option>
                <option value="json">JSON</option>
              </RegularizeNativeSelect>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Conteúdo
              <textarea
                className={`${regularizeTextareaClassName} mt-1.5 min-h-40 font-mono text-xs`}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck={false}
                disabled={importMutation.isPending}
                aria-invalid={tooLong}
              />
            </label>
            {tooLong ? (
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
                Conteúdo acima do tamanho máximo. Importe em partes menores.
              </p>
            ) : null}
            <button
              type="submit"
              disabled={importMutation.isPending || !content.trim() || tooLong}
              className={regularizePrimaryButtonClassName}
            >
              {importMutation.isPending ? "Importando…" : "Importar avisos"}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            Seu acesso permite conferir as importações, mas não importar.
          </p>
        )}

        {importMutation.isError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
          >
            {getRegularizeMutationErrorMessage(
              importMutation.error,
              "Não foi possível importar os avisos. Confira o conteúdo e tente novamente.",
            )}
          </p>
        ) : null}
        {importMutation.isSuccess ? (
          <div
            role="status"
            className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          >
            Importação concluída: <ImportSummary item={importMutation.data} />
            <ImportDetails item={importMutation.data} />
          </div>
        ) : null}
      </section>

      <section className={regularizePanelClassName}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Importações recentes
        </h2>
        {/* ponytail: só a página mais recente (20); paginar quando o histórico passar disso. */}
        {importsQuery.isLoading ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Carregando importações…</p>
        ) : importsQuery.isError ? (
          <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">
            Não foi possível carregar as importações. Tente novamente.
          </p>
        ) : !imports.length ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Nenhuma importação registrada.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 text-sm dark:divide-slate-700">
            {imports.map((item) => (
              <li key={item.id} className="py-3 text-slate-800 dark:text-slate-100">
                <span className="font-medium">{formatDateTime(item.created_at)}</span> ·{" "}
                {item.format.toUpperCase()} · <ImportSummary item={item} />
                <ImportDetails item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
