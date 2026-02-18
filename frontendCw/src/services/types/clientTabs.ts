// Usaremos esta interface 'Client' em toda a aplicação
export interface Client {
    id: string;
    dominio_code: string;
    name: string;
    company_name: string;
    fantasy_name: string;
    cnpj: string;
    cnae: string;
    cnae_secondary: string;
    responsible: string;
    cpf_responsible: string;
    agent: string;
    cpf_agent: string;
    number: string;
    email: string;
    address: string;
    cep: string;
    neighborhood: string;
    state: string;
    city: string;
    customer_since: Date | null;
    municipal_registration: string;
    state_registration: string;
    commercial_board_registration: string;
    status: string;
    competence_entry: string | null;
    competence_output: string | null;
    opening_date: Date | null;
    instagram: string;
    indication: string;
    regime: string;
    size: string;
    segment: string;
    contabil: boolean;
    fiscal: boolean;
    pessoal: boolean;
    infoproduto: boolean;
    consultoria: boolean;
    castelo_med: boolean;
    start_strike: Date | null;
    end_strike: Date | null;
    deletion_date: Date | null;
    contract: string;
    service: string;
    solucao: string;
    prospecting_status: string;
    date_status: Date | null;
    closing_date: Date | null;
    description_prospecting: string;
    month_prospecting: Date | null;
    register_date_prospecting: Date | null;
    participants_meet: string;
    meet_type: string;
    service_unique: boolean;
    type: 'PJ' | 'PF'
    type_registration: string;
    cpf_cnpj: string;
}

// Usaremos esta interface 'Perms' em toda a aplicação
export interface Perms {
    id: string;
    user_id: string;
    atendimento: number | null;
    certificado: number | null;
    comercial: number | null;
    contabil: number | null;
    financeiro: number | null;
    fiscal: number | null;
    integracao: number | null;
    marketing: number | null;
    parcelamento: number | null;
    pec: number | null;
    pessoal: number | null;
    regularize: number | null;
    rh: number | null;
    triagem: number | null;
    wiki: number | null;
}