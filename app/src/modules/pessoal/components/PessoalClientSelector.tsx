import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";

import type { PessoalClientOption } from "../types";

interface PessoalClientSelectorProps {
  selectedClient: PessoalClientOption | null;
  onSelectClient: (client: PessoalClientOption | null) => void;
}

export function PessoalClientSelector({
  selectedClient,
  onSelectClient,
}: PessoalClientSelectorProps) {
  function handleSelectClient(client: ClientPickerOption | null) {
    onSelectClient(client);
  }

  return (
    <ClientPickerModal
      selectedClient={selectedClient}
      onSelectClient={handleSelectClient}
      filters={{ ref: "deps", status: "Departamento pessoal" }}
      allowClearSelection
    />
  );
}
