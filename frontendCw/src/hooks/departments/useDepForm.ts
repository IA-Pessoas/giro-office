import { useState, ChangeEvent } from 'react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '../../services/api';

interface DepItem {
  id: string
  name: string
  color: string
  solution: boolean
  status: string
}

const getInitialState = (dep: DepItem) => ({
  name: dep?.name || '',
  color: dep?.color || '',
  solution: dep.solution || false,
  status: dep?.status || '',
});

export const useDepForm = (initialDep: DepItem) => {
  const [formData, setFormData] = useState(getInitialState(initialDep));
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const apiClient = setupAPIClient();

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    const finalValue = (e.target as HTMLInputElement).type === 'checkbox'
      ? (e.target as HTMLInputElement).checked
      : value;

    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  // Função de atualização principal
  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      const payload = {
        dep_id: initialDep.id,
        name: formData.name,
        color: formData.color,
        solution: formData.solution,
        status: formData.status,
      };
      
      const response = await apiClient.put('/departments', payload);
      
      const updated = response.data; 
      setFormData(getInitialState(updated)); 

      toast.success("Atualizado com sucesso!");
    } catch (error) {
      toast.error("Erro ao atualizar!");
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