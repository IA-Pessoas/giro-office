import { useState, type FormEvent } from "react";
import { MapPin, Pencil, Plus, Power, Save } from "lucide-react";

import { Dialog } from "@shared/components/ui/Dialog";
import { StatusBadge } from "@shared/components/StatusBadge";

import {
  useCreateTiInventoryLocationMutation,
  useTiInventoryLocations,
  useUpdateTiInventoryLocationMutation,
} from "../hooks";
import type { TiInventoryLocation } from "../types";
import { getTiInventoryMutationErrorMessage } from "../utils/inventoryMutationError";
import {
  TiDataTable,
  TiEmptyState,
  TiInlineNotice,
  TiQueryStatePanel,
  TiTableAction,
  TiTextField,
} from "./tiFormControls";
import {
  tiDialogSubsectionClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
  tiStatusBadgeClassName,
} from "./tiWorkspaceUi";

type TiInventoryLocationsDialogProps = {
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function isActive(location: TiInventoryLocation): boolean {
  return location.active !== false;
}

/**
 * Locais onde ficam os itens de inventário que não estão com uma pessoa. São outro cadastro
 * que os locais de estoque (aba Estoque), que têm andar.
 */
export function TiInventoryLocationsDialog({
  canManage,
  onOpenChange,
  open,
}: TiInventoryLocationsDialogProps) {
  const [editing, setEditing] = useState<TiInventoryLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locationsQuery = useTiInventoryLocations(undefined, { enabled: open });
  const createMutation = useCreateTiInventoryLocationMutation();
  const updateMutation = useUpdateTiInventoryLocationMutation();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (mutationError) {
      setError(getTiInventoryMutationErrorMessage(mutationError));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) {
      setError("Informe o nome do local.");
      return;
    }

    void run(async () => {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload: { name } });
      } else {
        await createMutation.mutateAsync({ name });
      }
      setEditing(null);
      form.reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setEditing(null);
          setError(null);
        }
        onOpenChange(nextOpen);
      }}
      title="Departamentos e locais de inventário"
      description="Opções do campo Departamento dos itens: onde fica o que não está com uma pessoa. Os locais de estoque, com andar, são cadastrados na aba Estoque."
      contentClassName="w-[min(92vw,860px)]"
    >
      <div className="space-y-4">
        {error ? <TiInlineNotice tone="danger">{error}</TiInlineNotice> : null}
        <section className={tiDialogSubsectionClassName}>
          <h3 className="mb-4 text-base font-semibold text-slate-950 dark:text-white">
            {editing ? "Editar local" : "Adicionar local"}
          </h3>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
            <div className="min-w-0 flex-1">
              <TiTextField
                key={editing ? `location-name-${editing.id}` : "location-name-new"}
                label="Nome"
                name="name"
                required
                defaultValue={editing?.name ?? ""}
              />
            </div>
            <button
              type="submit"
              className={tiPrimaryButtonClassName}
              disabled={isSubmitting || !canManage}
            >
              {editing ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              <span>{isSubmitting ? "Salvando..." : editing ? "Salvar" : "Adicionar"}</span>
            </button>
            {editing ? (
              <button
                type="button"
                className={tiSecondaryButtonClassName}
                disabled={isSubmitting}
                onClick={() => {
                  setEditing(null);
                  setError(null);
                }}
              >
                Cancelar
              </button>
            ) : null}
          </form>
        </section>
        <TiQueryStatePanel
          query={locationsQuery}
          emptyState={
            <TiEmptyState
              icon={MapPin}
              title="Nenhum local encontrado"
              description="Cadastre os locais onde os itens de inventário ficam guardados."
            />
          }
        >
          {(locations) => (
            <TiDataTable headers={["Local", "Status", ""]}>
              {locations.map((location) => (
                <tr key={location.id} className="text-slate-700 dark:text-slate-200">
                  <td className="px-4 py-3 font-semibold">{location.name ?? "Local sem nome"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      config={
                        isActive(location)
                          ? { label: "Ativo", variant: "success" }
                          : { label: "Inativo", variant: "neutral" }
                      }
                      className={tiStatusBadgeClassName}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <TiTableAction
                        icon={Pencil}
                        label="Editar"
                        disabled={!canManage || isSubmitting}
                        onClick={() => {
                          setEditing(location);
                          setError(null);
                        }}
                      />
                      {/* Desativar não apaga: os itens que já apontam para o local continuam nele. */}
                      <TiTableAction
                        icon={Power}
                        label={isActive(location) ? "Desativar" : "Reativar"}
                        disabled={!canManage || isSubmitting}
                        onClick={() =>
                          void run(() =>
                            updateMutation.mutateAsync({
                              id: location.id,
                              payload: { active: !isActive(location) },
                            }),
                          )
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </TiDataTable>
          )}
        </TiQueryStatePanel>
      </div>
    </Dialog>
  );
}
