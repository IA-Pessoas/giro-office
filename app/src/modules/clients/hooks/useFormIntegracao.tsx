import { useState, ChangeEvent } from 'react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';

interface ClientFormData {
    id: string
    name: string
    type: string
    type_registration: string
    cpf_cnpj: string
    company_name: string
    fantasy_name: string
    cnpj: string
    responsible: string
    cpf_responsible: string
    agent: string
    cpf_agent: string
    number: string
    email: string
    address: string
    cep: string
    neighborhood: string
    state: string
    city: string
    instagram: string
    indication: string
    participants_meet: string
    meet_type: string
    service_unique: boolean
}

const getInitialState = (client: ClientFormData) => ({
    name: client?.name || '',
    type: client?.type || 'PJ',
    type_registration: client?.type_registration || 'Novo',
    cpf_cnpj: client?.cpf_cnpj || '',
    company_name: client?.company_name || '',
    fantasy_name: client?.fantasy_name || '',
    cnpj: client?.cnpj || '',
    responsible: client?.responsible || '',
    cpf_responsible: client?.cpf_responsible || '',
    agent: client?.agent || '',
    cpf_agent: client?.cpf_agent || '',
    number: client?.number || '',
    email: client?.email || '',
    address: client?.address || '',
    cep: client?.cep || '',
    neighborhood: client?.neighborhood || '',
    state: client?.state || '',
    city: client?.city || '',
    instagram: client?.instagram || '',
    indication: client?.indication || '',
    participants_meet: client?.participants_meet || '',
    meet_type: client?.meet_type || '',
    service_unique: client?.service_unique || false,
});

export const useClientFormIntegracao = (initial: ClientFormData) => {
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
                name: formData.name,
                type: formData.type,
                type_registration: formData.type_registration,
                cpf_cnpj: formData.cpf_cnpj,
                company_name: formData.company_name,
                fantasy_name: formData.fantasy_name,
                cnpj: formData.cnpj,
                responsible: formData.responsible,
                cpf_responsible: formData.cpf_responsible,
                agent: formData.agent,
                cpf_agent: formData.cpf_agent,
                number: formData.number,
                email: formData.email,
                address: formData.address,
                cep: formData.cep,
                neighborhood: formData.neighborhood,
                state: formData.state,
                city: formData.city,
                instagram: formData.instagram,
                indication: formData.indication,
                participants_meet: formData.participants_meet,
                meet_type: formData.meet_type,
                service_unique: formData.service_unique,
            };

            const response = await apiClient.put('/clients-integracao', payload);

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