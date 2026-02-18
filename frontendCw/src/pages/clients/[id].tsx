import React from 'react';
import { Box } from "@chakra-ui/react";
import 'react-toastify/dist/ReactToastify.css';

import { ClientTabs } from '../../components/Tabs/ClientTabs';

import { canSSRAuth } from '../../utils/canSSRAuth';
import { setupAPIClient } from '../../services/api';

interface ClientItem {
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
    agent: string
    cpf_agent: string
    number: string
    email: string
    address: string
    cep: string
    neighborhood: string
    state: string
    city: string
    customer_since: Date | null
    municipal_registration: string
    state_registration: string
    commercial_board_registration: string
    status: string
    competence_entry: string | null
    competence_output: string | null
    opening_date: Date | null
    instagram: string
    indication: string
    regime: string
    size: string
    segment: string
    contabil: string
    fiscal: string
    pessoal: string
    infoproduto: string
    consultoria: string
    castelo_med: string
    start_strike: Date | null
    end_strike: Date | null
    deletion_date: Date | null
    contract: string
    service: string
    solucao: string
    prospecting_status: string
    date_status: Date | null
    closing_date: Date | null
    description_prospecting: string
    month_prospecting: Date | null
    register_date_prospecting: Date | null
    participants_meet: string
    meet_type: string
    service_unique: boolean
}
interface PermItem {
    id: string
    user_id: string
    atendimento: number | null
    certificado: number | null
    comercial: number | null
    contabil: number | null
    financeiro: number | null
    fiscal: number | null
    integracao: number | null
    marketing: number | null
    parcelamento: number | null
    pec: number | null
    pessoal: number | null
    regularize: number | null
    rh: number | null
    triagem: number | null
    wiki: number | null
}
interface Props {
    client: ClientItem
    perms: PermItem
}

export default function Client({ client, perms }: Props) {
    return (
        <>
            <Box p={4}>                
                <ClientTabs client={client} perms={perms} />
            </Box>
        </>
    );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    const { id } = ctx.params;

    try {
        const apiClient = setupAPIClient(ctx);

        const [meResponse, permResponse, clientResponse] = await Promise.all([
            apiClient.get('/me'),
            apiClient.get('/permission'),
            apiClient.get('/client', { params: { client_id: id } })
        ])

        return {
            props: {
                perms: permResponse.data.permission,
                client: clientResponse.data.client,
            },
        };
    } catch (error) {
        console.log(error);
        return {
            redirect: {
                destination: '/dashboard',
                permanent: false,
            },
        };
    }
});
