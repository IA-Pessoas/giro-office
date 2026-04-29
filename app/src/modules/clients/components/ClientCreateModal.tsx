import { useMemo, useState, type ChangeEvent } from "react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { useMe } from "@shared/hooks/useMe";

import { useCreateClientMutation } from "../hooks/useClients";
import { mapClientStatusToApi } from "../utils/statusMapper";
import type { Client, ClientFormValues } from "../types";
import { ClientForm } from "./ClientForm";

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (newClient: Client) => void;
}

export function ClientCreateModal({ isOpen, onClose, onCreated }: CreateModalProps) {
  const meQuery = useMe();
  const createClientMutation = useCreateClientMutation();
  const initialValues = useMemo<ClientFormValues>(
    () => ({
      name: "",
      company_name: "",
      fantasy_name: "",
      cpf_cnpj: "",
      status: "Ativo",
      service_unique: false,
    }),
    [],
  );
  const [formValues, setFormValues] = useState<ClientFormValues>(initialValues);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target;
    const nextValue = type === "checkbox" ? (event.target as HTMLInputElement).checked : value;

    setFormValues((current) => ({
      ...current,
      [name]: nextValue,
    }));
  };

  const handleClose = () => {
    setFormValues(initialValues);
    onClose();
  };

  const handleCreate = async () => {
    const organizationId = meQuery.data?.organization_id;

    if (!organizationId) {
      toast.error("Não foi possível identificar a organização do usuário.");
      return;
    }

    if (!formValues.name.trim() || !formValues.cpf_cnpj.trim()) {
      toast.error("Preencha nome e CPF/CNPJ para continuar.");
      return;
    }

    try {
      const createdClient = await createClientMutation.mutateAsync({
        organization_id: organizationId,
        name: formValues.name.trim(),
        company_name: formValues.company_name.trim() || null,
        fantasy_name: formValues.fantasy_name.trim() || null,
        cpf_cnpj: formValues.cpf_cnpj.replace(/\D/g, ""),
        status: mapClientStatusToApi(formValues.status),
        service_unique: formValues.service_unique,
      });

      toast.success("Cliente cadastrado com sucesso.");
      onCreated?.(createdClient);
      handleClose();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Erro ao cadastrar cliente.";

      toast.error(message);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
      title="Cadastrar novo cliente"
      description="Preencha os dados principais para cadastrar um cliente."
      contentClassName="w-[min(92vw,760px)]"
      bodyClassName="pb-4"
    >
      <ClientForm
        values={formValues}
        onChange={handleInputChange}
        onSubmit={() => void handleCreate()}
        onCancel={handleClose}
        submitLabel={createClientMutation.isPending ? "Salvando..." : "Salvar"}
        disabled={createClientMutation.isPending || meQuery.isLoading}
      />
    </Dialog>
  );
}
