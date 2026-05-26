import { useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";

import { departmentService } from "../services/departmentService";
import type { DepItem } from "../types";

function normalizeDepartmentStatus(status?: string): string {
  if (status === "active") {
    return "Ativo";
  }

  if (status === "inactive") {
    return "Inativo";
  }

  return status || "Ativo";
}

const getInitialState = (dep: DepItem) => ({
  name: dep?.name || "",
  color: dep?.color || "#3B82F6",
  solution: dep.solution || false,
  status: normalizeDepartmentStatus(dep?.status),
});

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

  return "Erro ao atualizar departamento.";
}

export const useDepForm = (initialDep: DepItem) => {
  const queryClient = useQueryClient();
  const [savedState, setSavedState] = useState(getInitialState(initialDep));
  const [formData, setFormData] = useState(getInitialState(initialDep));
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isDirty =
    formData.name.trim() !== savedState.name.trim() ||
    formData.color.toLowerCase() !== savedState.color.toLowerCase() ||
    formData.status !== savedState.status ||
    formData.solution !== savedState.solution;

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    const finalValue =
      (e.target as HTMLInputElement).type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : value;

    setFormData((prev) => ({ ...prev, [name]: finalValue }));
  };

  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      const updated = await departmentService.update(initialDep.id, {
        name: formData.name.trim(),
        color: formData.color,
        solution: formData.solution,
        status: normalizeDepartmentStatus(formData.status),
      });

      const nextState = getInitialState(updated);
      setSavedState(nextState);
      setFormData(nextState);
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Atualizado com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    formData,
    isDirty,
    isLoading,
    file,
    handleInputChange,
    handleUpdate,
  };
};
