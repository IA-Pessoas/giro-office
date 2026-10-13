import { useState, ChangeEvent } from 'react';
import { toast } from "@shared/services/toast";
import type { UserItem, UpdateUserData } from '../types';
import { isOrganizationOwner } from '@modules/auth';
import { userService } from '../services/userService';

const getInitialState = (user: UserItem) => ({
  name: user?.name || '',
  permission: user?.permission ?? 0,
  department_id: user?.department_id || '',
  status: user?.status || '',
  photoUrl: user?.photo || user?.photo_url || null,
});

export const useUserForm = (initialUser: UserItem) => {
  const [formData, setFormData] = useState(getInitialState(initialUser));
  const [savedUser, setSavedUser] = useState(initialUser);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setFormData(prev => ({ ...prev, photoUrl: URL.createObjectURL(selectedFile) }));
    }
  };

  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      const updateData: UpdateUserData = {
        name: formData.name,
        // O papel do owner não é um nível de permissão (ADR 0002): não sobrescrever.
        // Permissão e departamento só seguem quando mudam: reenviá-los faz o servidor
        // rederivar os módulos do usuário (#1930).
        ...(isOrganizationOwner(initialUser) || formData.permission === savedUser.permission
          ? {}
          : { permission: formData.permission }),
        ...(formData.department_id === savedUser.department_id
          ? {}
          : { department_id: formData.department_id }),
        status: formData.status,
        file: file || undefined,
      };
      
      const updatedUser = await userService.update(initialUser.id, updateData);
      setFormData(getInitialState(updatedUser));
      setSavedUser(updatedUser);
      setFile(null);
      
      toast.success("Usuário atualizado com sucesso!");
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
    handleInputChange,
    handleFileChange,
    handleUpdate
  };
};
