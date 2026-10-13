import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Plus, Trash2 } from "lucide-react";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import { RH_ENDPOINTS, unwrapRhEnvelope } from "../services/rhService.contract";
import { setupAPIClient } from "@shared/services/api";

interface RhExam {
  id: string;
  title: string;
  status: "New" | "Open" | "Closed" | "Cancelled";
  window_start: string | null;
  window_end: string | null;
  evaluator: { id: string; name: string };
  _count: { participants: number; questions: number };
}

interface RhExamDetails extends RhExam {
  observations: string;
  participants: Array<{ id: string; user: { id: string; name: string } }>;
  questions: Array<{ id: string; prompt: string; value: number; answer_key: string; position: number }>;
}

interface QuestionDraft {
  prompt: string;
  value: string;
  answer_key: string;
}

const STATUS_LABEL: Record<RhExam["status"], string> = {
  New: "Nova",
  Open: "Aberta",
  Closed: "Fechada",
  Cancelled: "Cancelada",
};

export function RhExamsSection() {
  const api = useMemo(() => setupAPIClient(), []);
  const users = useAssignableUsers({ module: "rh" });
  const [exams, setExams] = useState<RhExam[]>([]);
  const [examDetails, setExamDetails] = useState<RhExamDetails | null>(null);
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [evaluatorId, setEvaluatorId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [observations, setObservations] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { prompt: "", value: "", answer_key: "" },
  ]);

  const loadExams = useCallback(async () => {
    try {
      setError(null);
      const response = await api.get(RH_ENDPOINTS.exams);
      setExams(unwrapRhEnvelope<RhExam[]>(response.data));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as provas.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  async function createExam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(RH_ENDPOINTS.exams, {
        title,
        evaluator_id: evaluatorId,
        participant_ids: participantIds,
        window_start: windowStart ? new Date(windowStart).toISOString() : undefined,
        window_end: windowEnd ? new Date(windowEnd).toISOString() : undefined,
        observations,
        questions: questions.map((question) => ({
          prompt: question.prompt,
          value: Number(question.value),
          answer_key: question.answer_key,
        })),
      });
      setTitle("");
      setEvaluatorId("");
      setParticipantIds([]);
      setWindowStart("");
      setWindowEnd("");
      setObservations("");
      setQuestions([{ prompt: "", value: "", answer_key: "" }]);
      await loadExams();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível criar a prova.");
    } finally {
      setSaving(false);
    }
  }

  async function openExam(id: string) {
    setSaving(true);
    setError(null);
    try {
      await api.post(RH_ENDPOINTS.openExam(id));
      await loadExams();
      setExamDetails((current) => (current?.id === id ? { ...current, status: "Open" } : current));
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Não foi possível abrir a prova.");
    } finally {
      setSaving(false);
    }
  }

  async function loadExamDetails(id: string) {
    if (examDetails?.id === id) {
      setExamDetails(null);
      return;
    }
    setDetailsLoadingId(id);
    setError(null);
    try {
      const response = await api.get(RH_ENDPOINTS.examDetail(id));
      setExamDetails(unwrapRhEnvelope<RhExamDetails>(response.data));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Não foi possível consultar a prova.");
    } finally {
      setDetailsLoadingId(null);
    }
  }

  function updateQuestion(index: number, field: keyof QuestionDraft, value: string) {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [field]: value } : question,
      ),
    );
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:ring-blue-900/40";
  const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
          <BookOpenCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Provas discursivas</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Crie provas, defina participantes e abra a avaliação.
          </p>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <form onSubmit={createExam} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className={labelClass}>Título</span>
            <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} />
          </label>
          <label>
            <span className={labelClass}>Avaliador</span>
            <select className={inputClass} value={evaluatorId} onChange={(event) => setEvaluatorId(event.target.value)} required>
              <option value="">Selecione uma pessoa</option>
              {(users.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label>
            <span className={labelClass}>Início da janela (informativo)</span>
            <input className={inputClass} type="datetime-local" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
          </label>
          <label>
            <span className={labelClass}>Fim da janela (informativo)</span>
            <input className={inputClass} type="datetime-local" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
          </label>
          <label className="md:col-span-2">
            <span className={labelClass}>Participantes</span>
            <select
              className={`${inputClass} min-h-28`}
              multiple
              value={participantIds}
              onChange={(event) => setParticipantIds(Array.from(event.target.selectedOptions, (option) => option.value))}
              required
            >
              {(users.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Use Ctrl ou Command para selecionar várias pessoas.</span>
          </label>
          <label className="md:col-span-2">
            <span className={labelClass}>Observações</span>
            <textarea className={inputClass} rows={2} value={observations} onChange={(event) => setObservations(event.target.value)} maxLength={5000} />
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Questões e gabarito</h3>
            <button type="button" onClick={() => setQuestions((current) => [...current, { prompt: "", value: "", answer_key: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-900/20">
              <Plus className="h-4 w-4" /> Adicionar questão
            </button>
          </div>
          {questions.map((question, index) => (
            <div key={`question-${index}`} className="grid gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700 md:grid-cols-[1fr_120px_1fr_auto]">
              <label>
                <span className={labelClass}>Questão {index + 1}</span>
                <textarea className={inputClass} rows={2} value={question.prompt} onChange={(event) => updateQuestion(index, "prompt", event.target.value)} required />
              </label>
              <label>
                <span className={labelClass}>Valor</span>
                <input className={inputClass} type="number" min="0.01" step="0.01" value={question.value} onChange={(event) => updateQuestion(index, "value", event.target.value)} required />
              </label>
              <label>
                <span className={labelClass}>Gabarito</span>
                <textarea className={inputClass} rows={2} value={question.answer_key} onChange={(event) => updateQuestion(index, "answer_key", event.target.value)} required />
              </label>
              <button type="button" aria-label={`Remover questão ${index + 1}`} disabled={questions.length === 1} onClick={() => setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))} className="self-end rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving || users.isLoading} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "Salvando…" : "Criar prova"}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Provas cadastradas</h3>
        {loading ? <p className="text-sm text-gray-500">Carregando provas…</p> : null}
        {!loading && exams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Nenhuma prova discursiva cadastrada.
          </div>
        ) : null}
        {exams.map((exam) => (
          <article key={exam.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-gray-900 dark:text-white">{exam.title}</h4>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{STATUS_LABEL[exam.status]}</span>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Avaliador: {exam.evaluator.name} · {exam._count.participants} participantes · {exam._count.questions} questões
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-expanded={examDetails?.id === exam.id}
                aria-controls={`rh-exam-details-${exam.id}`}
                onClick={() => void loadExamDetails(exam.id)}
                disabled={detailsLoadingId === exam.id}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {detailsLoadingId === exam.id ? "Carregando…" : examDetails?.id === exam.id ? "Ocultar detalhes" : "Detalhes"}
              </button>
              {exam.status === "New" ? (
                <button type="button" onClick={() => void openExam(exam.id)} disabled={saving} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-900/20">
                  Abrir prova
                </button>
              ) : null}
            </div>
            {examDetails?.id === exam.id ? (
              <div id={`rh-exam-details-${exam.id}`} className="w-full space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Janela informativa:</span>{" "}
                    {examDetails.window_start ? new Date(examDetails.window_start).toLocaleString("pt-BR") : "Sem início"}
                    {" — "}
                    {examDetails.window_end ? new Date(examDetails.window_end).toLocaleString("pt-BR") : "Sem fim"}
                  </p>
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Observações:</span> {examDetails.observations || "Nenhuma"}
                  </p>
                </div>
                <div>
                  <h5 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Participantes</h5>
                  <ul className="flex flex-wrap gap-2">
                    {examDetails.participants.map((participant) => (
                      <li key={participant.id} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {participant.user.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Questões e gabarito</h5>
                  {examDetails.questions.map((question, index) => (
                    <div key={question.id} className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-900/60">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {index + 1}. {question.prompt} <span className="font-normal text-gray-500">· Valor: {question.value}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-400">Gabarito: {question.answer_key}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
