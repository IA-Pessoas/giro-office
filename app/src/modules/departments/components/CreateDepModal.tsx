import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { departmentService } from "../services/departmentService";
import type { DepItem } from "../types";

interface CreateDepModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (newDep: DepItem) => void;
}

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const responseMessage = error.response?.data?.error;
    if (typeof responseMessage === "string" && responseMessage.trim().length > 0) {
      return responseMessage;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Erro ao cadastrar departamento.";
}

export function CreateDepModal({ isOpen, onClose, onCreated }: CreateDepModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    color: "#3B82F6",
    solution: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const nextValue =
      e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : value;

    setFormData((prev) => ({ ...prev, [name]: nextValue }));
  };

  const handleCadastrar = async () => {
    if (!formData.name.trim()) {
      toast.warn("Preencha o nome do departamento.");
      return;
    }

    setIsLoading(true);
    try {
      const createdDepartment = await departmentService.create({
        name: formData.name.trim(),
        color: formData.color,
        solution: formData.solution,
      });

      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Departamento cadastrado com sucesso.");
      onCreated?.(createdDepartment);
      onClose();
      setFormData({ name: "", color: "#3B82F6", solution: false });
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title="Cadastrar novo departamento"
      footer={
        <>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ui-button-primary"
            disabled={isLoading}
            onClick={handleCadastrar}
          >
            {isLoading ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <div className="u-stack u-gap-4">
        <div className="u-stack u-gap-2">
          <label htmlFor="dep-name" className="text-sm font-medium text-[var(--colors-blue-500)]">
            Nome
          </label>
          <input
            id="dep-name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className="ui-input"
            required
          />
        </div>

        <div className="u-stack u-gap-2">
          <label htmlFor="dep-color" className="text-sm font-medium text-[var(--colors-blue-500)]">
            Cor
          </label>
          <input
            id="dep-color"
            name="color"
            type="color"
            value={formData.color}
            onChange={handleInputChange}
            className="h-10 w-full rounded-lg border border-black/15 bg-white p-1"
            required
          />
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
          <input
            id="dep-solution"
            name="solution"
            type="checkbox"
            checked={formData.solution}
            onChange={handleInputChange}
            className="h-4 w-4 rounded border-slate-300 text-[var(--colors-brand-gradient-end)] focus:ring-[var(--colors-brand-gradient-start)]"
          />
          Marcar como departamento de solução
        </label>
      </div>
    </Dialog>
  );
}
