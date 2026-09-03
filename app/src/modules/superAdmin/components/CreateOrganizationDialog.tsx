import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components/ui/Dialog";
import { Button } from "@shared/ui/newLayout/button";
import { Input } from "@shared/ui/newLayout/input";

import { useCreatePlatformOrganization } from "../hooks/usePlatformOrganizationMutations";
import type { PlatformOrganization } from "../types";
import { formatCnpjInput, getPlatformErrorMessage } from "../utils/platformManagement";

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: () => void;
  onCreated: (organization: PlatformOrganization) => void;
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  onCreated,
}: CreateOrganizationDialogProps) {
  const mutation = useCreatePlatformOrganization();
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setCnpj("");
      setErrorMessage(null);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;

    setErrorMessage(null);
    try {
      const organization = await mutation.mutateAsync({ name: name.trim(), cnpj });
      onCreated(organization);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(getPlatformErrorMessage(error, "Não foi possível criar a organização."));
    }
  };

  return (
    <Dialog
      contentClassName="!w-[min(92vw,520px)]"
      description="Informe somente os dados imutáveis da nova organização."
      footer={
        <>
          <Button
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            disabled={mutation.isPending || !name.trim() || cnpj.replace(/\D/g, "").length !== 14}
            form="create-platform-organization-form"
            type="submit"
          >
            {mutation.isPending ? "Criando..." : "Criar organização"}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onCloseAutoFocus();
      }}
      open={open}
      preventClose={mutation.isPending}
      title="Criar organização"
    >
      <form className="space-y-4" id="create-platform-organization-form" onSubmit={handleSubmit}>
        <div>
          <label
            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            htmlFor="platform-organization-name"
          >
            Nome
          </label>
          <Input
            autoComplete="organization"
            className="mt-1.5 bg-white dark:bg-slate-950"
            disabled={mutation.isPending}
            id="platform-organization-name"
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            htmlFor="platform-organization-cnpj"
          >
            CNPJ
          </label>
          <Input
            autoComplete="off"
            className="mt-1.5 bg-white dark:bg-slate-950"
            disabled={mutation.isPending}
            id="platform-organization-cnpj"
            inputMode="numeric"
            maxLength={18}
            onChange={(event) => setCnpj(formatCnpjInput(event.target.value))}
            placeholder="00.000.000/0000-00"
            required
            value={cnpj}
          />
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
            Digite 14 números; a máscara é aplicada automaticamente.
          </p>
        </div>
        {errorMessage ? (
          <p
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
