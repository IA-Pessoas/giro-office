// src/hooks/useUserForm.ts
import { useState, ChangeEvent } from 'react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';

// Reutilize a interface UserItem aqui ou mova para um arquivo de tipos
interface UserItem {
  id: string;
  name: string;
  login: string;
  permission: number;
  department_id: string;
  status: string;
  photo: string | null;
}

// O estado inicial do nosso formulário
const getInitialState = (user: UserItem) => ({
  name: user?.name || '',
  password: '',
  permission: user?.permission ?? 0,
  department_id: user?.department_id || '',
  status: user?.status || '',
  photoUrl: user?.photo || null,
});

export const useUserForm = (initialUser: UserItem) => {
  const [formData, setFormData] = useState(getInitialState(initialUser));
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const apiClient = setupAPIClient();

  // Uma única função para lidar com todas as mudanças nos inputs
  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Lida com a seleção de arquivo e cria uma URL de preview
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setFormData(prev => ({ ...prev, photoUrl: URL.createObjectURL(selectedFile) }));
    }
  };

  // Função de atualização principal
  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      const data = new FormData();
      data.append('user_id', initialUser.id);
      data.append('name', formData.name);
      data.append('password', formData.password);
      data.append('permission', String(formData.permission));
      data.append('department_id', formData.department_id);
      data.append('status', formData.status);
      if (file) {
        data.append('file', file);
      }
      
      const response = await apiClient.put('/users', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      // Atualiza o estado com os dados retornados pela API após o update
      const updatedUser = response.data; 
      setFormData(getInitialState(updatedUser)); 
      setFile(null); // Limpa o arquivo selecionado
      
      toast.success("Usuário atualizado com sucesso!");
    } catch (error) {
      toast.error("Erro ao atualizar!");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Retorna os estados e funções para o componente usar
  return {
    formData,
    isLoading,
    file,
    handleInputChange,
    handleFileChange,
    handleUpdate,
  };
};