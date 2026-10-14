import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, FileCheck2, FileUp, Loader2, XCircle } from "lucide-react";
import { rhScoreService } from "../../services/rhScoreService";
import type { RhNitroHoursSubmission, RhNitroHoursSummary } from "../../types";
import { formatRhQuarterLabel, getDefaultRhQuarterValue, getRhQuarterOptions } from "../../utils/rhScoreUi";
import { getErrorMessage } from "./rhScoreShared";

const STATUS_LABEL: Record<RhNitroHoursSubmission["status"], string> = {
  Pending: "Em análise",
  Accepted: "Aceita",
  Rejected: "Rejeitada",
};

const STATUS_STYLE: Record<RhNitroHoursSubmission["status"], string> = {
  Pending: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  Accepted: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  Rejected: "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
};

export function RhNitroHoursPanel({ canManageScore }: { canManageScore: boolean }) {
  const quarterOptions = useMemo(() => getRhQuarterOptions(), []);
  const [quarter, setQuarter] = useState(getDefaultRhQuarterValue);
  const [submissions, setSubmissions] = useState<RhNitroHoursSubmission[]>([]);
  const [summary, setSummary] = useState<RhNitroHoursSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hours, setHours] = useState(1);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, totals] = await Promise.all([
        rhScoreService.listNitroHoursSubmissions({ quarter, ...(canManageScore && selectedUserId ? { user_id: selectedUserId } : {}) }),
        rhScoreService.getNitroHoursSummary(quarter, canManageScore ? (selectedUserId || undefined) : undefined),
      ]);
      setSubmissions(rows);
      setSummary(totals);
      if (!selectedUserId && canManageScore && rows[0]) setSelectedUserId(rows[0].user_id);
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "Não foi possível carregar as horas Nitro."));
    } finally {
      setLoading(false);
    }
  }, [canManageScore, quarter, selectedUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit() {
    if (!certificate) {
      setError("Selecione o certificado que comprova as horas.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("quarter", quarter);
      form.set("hours", String(hours));
      form.set("certificate", certificate);
      await rhScoreService.submitNitroHours(form);
      setCertificate(null);
      setMessage("Horas enviadas para análise do RH.");
      await refresh();
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "Não foi possível enviar as horas."));
    } finally {
      setSaving(false);
    }
  }

  async function decide(id: string, status: "Accepted" | "Rejected") {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await rhScoreService.decideNitroHours(id, {
        status,
        ...(status === "Rejected" ? { rejection_reason: rejectionReasons[id] ?? "" } : {}),
      });
      setMessage(status === "Accepted" ? "Horas aceitas." : "Solicitação rejeitada.");
      await refresh();
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "Não foi possível registrar a decisão."));
    } finally {
      setSaving(false);
    }
  }

  async function openCertificate(id: string) {
    try {
      const url = await rhScoreService.getNitroHoursCertificateUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "Não foi possível abrir o certificado."));
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Horas complementares Nitro</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Envie certificados e acompanhe as horas aceitas por trimestre.</p>
          </div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Trimestre
            <select value={quarter} onChange={(event) => setQuarter(event.target.value)} className="mt-1 block min-w-36 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
              {quarterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {summary ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
            <FileCheck2 className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            <p className="text-sm text-blue-950 dark:text-blue-100">
              <strong>{summary.accepted_hours} h aceitas</strong> em {formatRhQuarterLabel(quarter)}. {summary.nitro_bonus ? "Bônus de +1 Nitro habilitado." : `${10 - summary.accepted_hours} h para habilitar o bônus de +1.`}
            </p>
          </div>
        ) : null}

        {!canManageScore ? (
          <div className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Horas comprovadas
              <input type="number" min={1} max={1000} step={1} value={hours} onChange={(event) => setHours(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Certificado (PDF, JPEG ou PNG; até 5 MB)
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setCertificate(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:font-medium file:text-blue-800 dark:text-gray-400 dark:file:bg-blue-950/50 dark:file:text-blue-200" />
            </label>
            <button type="button" disabled={saving} onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Enviar
            </button>
          </div>
        ) : null}
      </section>

      {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">{message}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Solicitações de {formatRhQuarterLabel(quarter)}</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Certificados ficam privados e só são liberados após validar seu acesso.</p>
            </div>
            {canManageScore && submissions.length > 0 ? (
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Colaborador
                <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="ml-2 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                  {[...new Map(submissions.map((item) => [item.user_id, item.user.name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando solicitações...</div>
        ) : submissions.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400"><Clock3 className="mx-auto mb-3 h-6 w-6" />Ainda não há horas enviadas neste trimestre.</div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {submissions.map((item) => (
              <li key={item.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">{item.hours} h</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    {canManageScore ? <span className="truncate text-xs text-gray-500 dark:text-gray-400">{item.user.name}</span> : null}
                  </div>
                  {item.rejection_reason ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">Motivo: {item.rejection_reason}</p> : null}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Enviado em {new Date(item.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void openCertificate(item.id)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">Abrir certificado</button>
                  {canManageScore && item.status === "Pending" ? (
                    <>
                      <button type="button" disabled={saving} onClick={() => void decide(item.id, "Accepted")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><CheckCircle2 className="h-4 w-4" /> Aceitar</button>
                      <input aria-label="Motivo da rejeição" value={rejectionReasons[item.id] ?? ""} onChange={(event) => setRejectionReasons((previous) => ({ ...previous, [item.id]: event.target.value }))} placeholder="Motivo para rejeitar" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white sm:w-48" />
                      <button type="button" disabled={saving || !(rejectionReasons[item.id] ?? "").trim()} onClick={() => void decide(item.id, "Rejected")} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"><XCircle className="h-4 w-4" /> Rejeitar</button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
