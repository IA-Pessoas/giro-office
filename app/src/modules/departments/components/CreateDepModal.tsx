import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { departmentService } from "../services/departmentService";
import type { DepItem } from "../types";
import { DepartmentColorField } from "./DepartmentColorField";

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
    color: "#2563eb",
    solution: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({ ...prev, [name]: value }));
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
      setFormData({ name: "", color: "#2563eb", solution: false });
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
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-60"
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
          <label htmlFor="dep-name" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Nome
          </label>
          <input
            id="dep-name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            required
          />
        </div>

        <div className="u-stack u-gap-2">
          <DepartmentColorField
            id="dep-color"
            value={formData.color}
            onChange={(color) => setFormData((prev) => ({ ...prev, color }))}
            labelClassName="text-sm font-medium text-slate-700 dark:text-slate-200"
            containerClassName="flex h-12 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>
    </Dialog>
  );
}
