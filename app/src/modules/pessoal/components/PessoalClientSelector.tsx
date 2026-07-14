import type { PessoalClientOption } from "../types";

interface PessoalClientSelectorProps {
  clients: PessoalClientOption[];
  selectedClientId: string;
  onSelectClient: (clientId: string) => void;
}

export function PessoalClientSelector({
  clients,
  selectedClientId,
  onSelectClient,
}: PessoalClientSelectorProps) {
  return (
    <label className="flex min-w-64 flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
      Cliente
      <select
        value={selectedClientId}
        onChange={(event) => onSelectClient(event.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      >
        <option value="">Selecione um cliente</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </label>
  );
}
