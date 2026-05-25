import { useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";

import { departmentService } from "../services/departmentService";
import type { DepItem } from "../types";

const getInitialState = (dep: DepItem) => ({
  name: dep?.name || "",
  color: dep?.color || "#3B82F6",
  solution: dep.solution || false,
  status: dep?.status || "Ativo",
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
  const [formData, setFormData] = useState(getInitialState(initialDep));
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        status: formData.status,
      });

      setFormData(getInitialState(updated));
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
    isLoading,
    file,
    handleInputChange,
    handleUpdate,
  };
};
