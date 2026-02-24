import { useState, ChangeEvent } from 'react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '../../services/api';

interface ClientFormData {
    id: string
    dominio_code: string
    name: string
    company_name: string
    fantasy_name: string
    cnpj: string
    cnae: string
    cnae_secondary: string
    responsible: string
    cpf_responsible: string
    number: string
    email: string
    address: string
    cep: string
    neighborhood: string
    state: string
    city: string
    customer_since: Date
    municipal_registration: string
    state_registration: string
    commercial_board_registration: string
    opening_date: Date
    regime: string
    size: string
    segment: string
    contabil: boolean
    fiscal: boolean
    pessoal: boolean
    infoproduto: boolean
    consultoria: boolean
    castelo_med: boolean
    start_strike: Date | null
    end_strike: Date | null
    deletion_date: Date | null
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
const formatDateForInput = (date: Date | string | null): string => {
  // Retorna uma string vazia se a data de entrada for nula ou vazia.
  if (!date) return '';

  try {
    const d = new Date(date);

    // Se a data for inválida (ex: new Date('texto-invalido')), retorna vazio.
    if (isNaN(d.getTime())) {
      return '';
    }
    
    // ✨ TRUQUE IMPORTANTE: Ajusta a data para o meio-dia em UTC.
    // Isso evita o erro comum de "off-by-one-day", onde a data pode
    // acidentalmente voltar um dia por causa do fuso horário do navegador.
    d.setUTCHours(12);

    // Pega os componentes da data em UTC para garantir consistência.
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth() é de 0 a 11
    const day = String(d.getUTCDate()).padStart(2, '0');
    
    // Retorna a string no formato que o input[type="date"] espera.
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Erro ao formatar a data:", error);
    return '';
  }
};

const getInitialState = (client: ClientFormData) => ({
    dominio_code: client?.dominio_code || '',
    name: client?.name || '',
    company_name: client?.company_name || '',
    fantasy_name: client?.fantasy_name || '',
    cnpj: client?.cnpj || '',
    cnae: client?.cnae || '',
    cnae_secondary: client?.cnae_secondary || '',
    responsible: client?.responsible || '',
    cpf_responsible: client?.cpf_responsible || '',
    number: client?.number || '',
    email: client?.email || '',
    address: client?.address || '',
    cep: client?.cep || '',
    neighborhood: client?.neighborhood || '',
    state: client?.state || '',
    city: client?.city || '',
    customer_since: formatDateForInput(client?.customer_since),
    municipal_registration: client?.municipal_registration || '',
    state_registration: client?.state_registration || '',
    commercial_board_registration: client?.commercial_board_registration || '',
    opening_date: formatDateForInput(client?.opening_date),
    regime: client?.regime || '',
    size: client?.size || '',
    segment: client?.segment || '',
    contabil: !!client?.contabil,
    fiscal: !!client?.fiscal,
    pessoal: !!client?.pessoal,
    infoproduto: !!client?.infoproduto,
    consultoria: !!client?.consultoria,
    castelo_med: !!client?.castelo_med,
    start_strike: formatDateForInput(client?.start_strike),
    end_strike: formatDateForInput(client?.end_strike),
    deletion_date: formatDateForInput(client?.deletion_date),
});


export const useClientFormRegularize = (initial: ClientFormData) => {
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
                dominio_code: formData.dominio_code,
                name: formData.name,
                company_name: formData.company_name,
                fantasy_name: formData.fantasy_name,
                cnpj: formData.cnpj,
                cnae: formData.cnae,
                cnae_secondary: formData.cnae_secondary,
                responsible: formData.responsible,
                cpf_responsible: formData.cpf_responsible,
                number: formData.number,
                email: formData.email,
                address: formData.address,
                cep: formData.cep,
                neighborhood: formData.neighborhood,
                state: formData.state,
                city: formData.city,
                customer_since: formData.customer_since ? new Date(formData.customer_since) : null,
                municipal_registration: formData.municipal_registration,
                state_registration: formData.state_registration,
                commercial_board_registration: formData.commercial_board_registration,
                opening_date: formData.opening_date ? new Date(formData.opening_date) : null,
                regime: formData.regime,
                size: formData.size,
                segment: formData.segment,
                contabil: formData.contabil,
                fiscal: formData.fiscal,
                pessoal: formData.pessoal,
                infoproduto: formData.infoproduto,
                consultoria: formData.consultoria,
                castelo_med: formData.castelo_med,
                start_strike: formData.start_strike ? new Date(formData.start_strike + 'T00:00:00Z') : null,
                end_strike: formData.end_strike ? new Date(formData.end_strike + 'T00:00:00Z') : null,
                deletion_date: formData.deletion_date ? new Date(formData.deletion_date + 'T00:00:00Z') : null,
            };

            const response = await apiClient.put('/clients-regularize', payload);

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