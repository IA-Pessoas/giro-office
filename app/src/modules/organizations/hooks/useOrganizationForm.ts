import { useState, ChangeEvent } from 'react';
import { toast } from 'react-toastify';
import { organizationService } from '../services/organizationService';
import type { Organization, CreateOrganizationData } from '../types';

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

export const useOrganizationForm = () => {
  const [formData, setFormData] = useState<CreateOrganizationData>({
    name: '',
    slug: '',
    cnpj: '',
    email_created_by: '',
    logo_url: '',
    status: 'active',
    subscription_plan: 'trial',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      
      if (name === 'name' && value) {
        updated.slug = generateSlug(value);
      }
      
      return updated;
    });
  };

  const handleCreate = async (): Promise<Organization | null> => {
    if (!formData.name || !formData.slug || !formData.cnpj || !formData.email_created_by) {
      toast.warn('Preencha todos os campos obrigatórios!');
      return null;
    }

    const cnpjClean = formData.cnpj.replace(/\D/g, '');
    if (cnpjClean.length !== 14) {
      toast.error('CNPJ deve conter 14 dígitos!');
      return null;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email_created_by)) {
      toast.error('Email inválido!');
      return null;
    }

    setIsLoading(true);
    try {
      const created = await organizationService.create({
        ...formData,
        cnpj: cnpjClean,
      });
      toast.success('Organização cadastrada com sucesso!');
      return created;
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Erro ao cadastrar organização.';
      toast.error(errorMessage);
      console.error(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      cnpj: '',
      email_created_by: '',
      logo_url: '',
      status: 'active',
      subscription_plan: 'trial',
    });
  };

  return {
    formData,
    isLoading,
    handleInputChange,
    handleCreate,
    resetForm,
  };
};
