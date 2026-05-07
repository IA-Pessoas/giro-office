import { useState } from "react";
import { toast } from "react-toastify";

import {
  useCreateRhMessageMutation,
  useRhMessages,
} from "../hooks/useRhRequests";
import type { RhMessageType } from "../types";
import {
  formatRhDateTime,
  getRhMessageTypeLabel,
} from "../utils/rhRequestUi";

interface RhRequestMessagesTimelineProps {
  requestId: string;
}

export function RhRequestMessagesTimeline({
  requestId,
}: RhRequestMessagesTimelineProps) {
  const messagesQuery = useRhMessages({ requestId });
  const createMessageMutation = useCreateRhMessageMutation();
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<RhMessageType>("Message");

  async function handleSubmit() {
    if (!message.trim()) {
      toast.warn("Digite uma mensagem antes de enviar.");
      return;
    }

    try {
      await createMessageMutation.mutateAsync({
        request_id: requestId,
        message: message.trim(),
        type: messageType,
      });
      setMessage("");
      setMessageType("Message");
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

        {!messagesQuery.isLoading && !messagesQuery.error && messages.length === 0 ? (
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
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                    {getRhMessageTypeLabel(item.type)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatRhDateTime(item.created_at)}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                  {item.message}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/20">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          Nova mensagem
        </h4>

        <div className="grid gap-3 md:grid-cols-[180px,1fr]">
          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span>Tipo</span>
            <select
              value={messageType}
              onChange={(event) =>
                setMessageType(event.target.value as RhMessageType)
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-rose-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="Message">Mensagem</option>
              <option value="Solution">Solução</option>
              <option value="Rejection">Rejeição</option>
              <option value="Acceptance">Aceite</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span>Mensagem</span>
            <textarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-rose-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Descreva a atualização do chamado"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createMessageMutation.isPending}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createMessageMutation.isPending ? "Enviando..." : "Enviar mensagem"}
          </button>
        </div>
      </div>
    </div>
  );
}
