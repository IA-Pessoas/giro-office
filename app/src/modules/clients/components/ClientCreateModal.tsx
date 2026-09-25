import { useMemo, useState, type ChangeEvent } from "react";
import { toast } from "@shared/services/toast";

import { Dialog } from "@shared/components";
import { useMe } from "@shared/hooks/useMe";

import { useCreateClientMutation } from "../hooks/useClients";
import {
  formatCpfCnpjInput,
  validateCpfCnpjDocument,
} from "../utils/documentValidation";
import type { Client, ClientFormValues } from "../types";
import {
  buildCreateClientPayload,
  createClientFormInitialValues,
  getClientInternalName,
} from "../utils/clientForm";
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
    () => createClientFormInitialValues(),
    [],
  );
  const [formValues, setFormValues] = useState<ClientFormValues>(initialValues);
  const [showDocumentError, setShowDocumentError] = useState(false);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type: inputType } = event.target;

    if (name === "type") {
      const nextType = value === "PF" ? "PF" : "PJ";

      setShowDocumentError(false);
      setFormValues((current) => ({
        ...current,
        type: nextType,
        cpf_cnpj: formatCpfCnpjInput(current.cpf_cnpj, nextType),
      }));
      return;
    }

    if (name === "cpf_cnpj") {
      setShowDocumentError(false);
      setFormValues((current) => ({
        ...current,
        cpf_cnpj: formatCpfCnpjInput(value, current.type ?? "PJ"),
      }));
      return;
    }

    const nextValue = inputType === "checkbox" ? (event.target as HTMLInputElement).checked : value;

    setFormValues((current) => ({
      ...current,
      [name]: nextValue,
    }));
  };

  const handleClose = () => {
    setFormValues(initialValues);
    setShowDocumentError(false);
    onClose();
  };

  const handleCreate = async () => {
    const organizationId = meQuery.data?.organization_id;

    if (!organizationId) {
      toast.error("Não foi possível identificar a organização do usuário.");
      return;
    }

    const documentError = formValues.cpf_cnpj.trim()
      ? validateCpfCnpjDocument(formValues.cpf_cnpj, formValues.type)
      : null;
    if (documentError) {
      setShowDocumentError(true);
    } else {
      setShowDocumentError(false);
    }

    if (!getClientInternalName(formValues) || !formValues.cpf_cnpj.trim()) {
      toast.error("Preencha nome e CPF/CNPJ para continuar.");
      return;
    }

    if (documentError) {
      toast.error(documentError);
      return;
    }

    try {
      const createdClient = await createClientMutation.mutateAsync(
        buildCreateClientPayload(formValues, organizationId),
      );

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
        showPersonType
        showDocumentError={showDocumentError}
        submitLabel={createClientMutation.isPending ? "Salvando..." : "Salvar"}
        disabled={createClientMutation.isPending || meQuery.isLoading}
      />
    </Dialog>
  );
}
