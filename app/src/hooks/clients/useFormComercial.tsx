import { useState, ChangeEvent } from 'react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';

interface ClientFormData {
    id: string
    prospecting_status: string
    date_status: Date
    description_prospecting: string
}

const formatDateTimeForInput = (date: Date | string | null): string => {
  if (!date) return '';

  try {
    const d = new Date(date);
    
    // Pega os componentes da data local do usuário
    const year = d.getFullYear();
    // getMonth() é base 0 (0-11), então somamos 1
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (error) {
    return '';
  }
};

const getInitialState = (client: ClientFormData) => ({
    prospecting_status: client?.prospecting_status || '',
    date_status: formatDateTimeForInput(client?.date_status) || null,
    description_prospecting: client?.description_prospecting || '',
});

export const useClientFormComercial = (initial: ClientFormData) => {
    const [formData, setFormData] = useState(getInitialState(initial));
    const [isLoading, setIsLoading] = useState(false);

    const apiClient = setupAPIClient();

    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;

        const finalValue = (e.target as HTMLInputElement).type === 'checkbox'
            ? (e.target as HTMLInputElement).checked
            : value;

        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleUpdate = async () => {
        setIsLoading(true);
        try {
            const payload = {
                client_id: initial.id,
                prospecting_status: formData.prospecting_status,
                date_status: formData.date_status ? new Date(formData.date_status) : null,
                description_prospecting: formData.description_prospecting,
            };

            const response = await apiClient.put('/clients-comercial', payload);

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
        handleInputChange,
        handleUpdate,
    };
};