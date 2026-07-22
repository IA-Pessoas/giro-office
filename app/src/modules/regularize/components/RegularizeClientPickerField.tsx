import { useEffect, useState } from "react";

import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";

interface RegularizeClientPickerFieldProps {
  allowClearSelection?: boolean;
  onChange: (clientId: string) => void;
  value: string;
}

export function RegularizeClientPickerField({
  allowClearSelection = false,
  onChange,
  value,
}: RegularizeClientPickerFieldProps) {
  const [selectedClient, setSelectedClient] = useState<ClientPickerOption | null>(null);

  useEffect(() => {
    setSelectedClient((current) =>
      current?.id === value ? current : value ? { id: value, name: "Cliente selecionado" } : null,
    );
  }, [value]);

  return (
    <ClientPickerModal
      selectedClient={selectedClient}
      onSelectClient={(client) => {
        setSelectedClient(client);
        onChange(client?.id ?? "");
      }}
      filters={{ status: "Ativo" }}
      allowClearSelection={allowClearSelection}
    />
  );
}
