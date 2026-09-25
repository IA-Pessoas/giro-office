import { useState } from "react";
import { ChevronDown, Paperclip } from "lucide-react";
import { toast } from "@shared/services/toast";

import {
  useCreateRhMessageMutation,
  useRhMessages,
} from "../hooks/useRhRequests";
import type { RhMessageType } from "../types";
import {
  getRhMessageTypeClassName,
  getRhMessageTypeLabel,
} from "../utils/rhRequestUi";
import { formatRhDateTime } from "../utils/rhDate";

interface RhRequestMessagesTimelineProps {
  requestId: string;
  canUseRhWorkflowMessages: boolean;
  canRespondToRhSolution: boolean;
}

export function RhRequestMessagesTimeline({
  requestId,
  canUseRhWorkflowMessages,
  canRespondToRhSolution,
}: RhRequestMessagesTimelineProps) {
  const messagesQuery = useRhMessages({ requestId });
  const createMessageMutation = useCreateRhMessageMutation();
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<RhMessageType>("Message");
  const [attachment, setAttachment] = useState<File | null>(null);

  async function handleSubmit() {
    if (!message.trim()) {
      toast.warn("Digite uma mensagem antes de enviar.");
      return;
    }

    try {
      await createMessageMutation.mutateAsync({
        payload: {
          request_id: requestId,
          message: message.trim(),
          type: messageType,
        },
        file: attachment ?? undefined,
      });
      setMessage("");
      setMessageType("Message");
      setAttachment(null);
      toast.success("Mensagem enviada com sucesso.");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a mensagem.";
      toast.error(errorMessage);
    }
  }

  const messages = messagesQuery.data ?? [];
  const messageTypes: RhMessageType[] = canUseRhWorkflowMessages
    ? ["Message", "Solution", "Rejection", "Acceptance"]
    : canRespondToRhSolution
      ? ["Message", "Rejection", "Acceptance"]
      : ["Message"];
  const canChooseMessageType = messageTypes.length > 1;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Timeline de mensagens
        </h3>

        {messagesQuery.isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
            Carregando mensagens...
          </div>
        ) : null}

        {!messagesQuery.isLoading && messagesQuery.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
            Não foi possível carregar as mensagens desta solicitação.
          </div>
        ) : null}

        {!messagesQuery.isLoading &&
        !messagesQuery.error &&
        messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-300">
            Ainda não há mensagens nesta solicitação.
          </div>
        ) : null}

        {!messagesQuery.isLoading && !messagesQuery.error && messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/20"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${getRhMessageTypeClassName(item.type)}`}
                  >
                    {getRhMessageTypeLabel(item.type)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatRhDateTime(item.created_at)}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                  {item.message}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{item.sender?.name ?? "Usuário RH"}</span>
                  {item.attachment ? (
                    <a
                      href={item.attachment}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-300"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Abrir anexo
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/20">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          Nova mensagem
        </h4>

        <div
          className={
            canChooseMessageType ? "grid gap-3 md:grid-cols-[180px,1fr]" : "block"
          }
        >
          {canChooseMessageType ? (
            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span>Tipo</span>
              <div className="relative">
                <select
                  value={messageType}
                  onChange={(event) =>
                    setMessageType(event.target.value as RhMessageType)
                  }
                  className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="Message">Mensagem</option>
                  {messageTypes.includes("Solution") ? <option value="Solution">Solução</option> : null}
                  {messageTypes.includes("Rejection") ? <option value="Rejection">Rejeição</option> : null}
                  {messageTypes.includes("Acceptance") ? <option value="Acceptance">Aceite</option> : null}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
            </label>
          ) : null}

          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span>Mensagem</span>
            <textarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Descreva a atualização do chamado"
            />
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Anexo opcional (PDF, PNG ou JPEG até 10 MB)</span>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (!file) {
                setAttachment(null);
                return;
              }
              if (file.size > 10 * 1024 * 1024) {
                toast.error("O anexo deve ter no máximo 10 MB.");
                event.target.value = "";
                setAttachment(null);
                return;
              }
              if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
                toast.error("Use um anexo PDF, PNG ou JPEG.");
                event.target.value = "";
                setAttachment(null);
                return;
              }
              setAttachment(file);
            }}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          {attachment ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">{attachment.name}</span>
          ) : null}
        </label>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createMessageMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createMessageMutation.isPending ? "Enviando..." : "Enviar mensagem"}
          </button>
        </div>
      </div>
    </div>
  );
}
