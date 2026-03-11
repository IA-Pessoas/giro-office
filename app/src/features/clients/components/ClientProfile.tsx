// src/components/Clients/ClientProfile.tsx
import React, { useEffect, useState } from 'react';
import { Box } from "@chakra-ui/react";
import { ClientTabs } from '../Tabs/ClientTabs';
import { LoadingSpinner } from '../layout/LoadingSpinner';
import { setupAPIClient } from '@shared/services/api';

interface ClientProfileProps {
    clientId: string;
}

export function ClientProfile({ clientId }: ClientProfileProps) {
    const [clientData, setClientData] = useState(null);
    const [perms, setPerms] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                const apiClient = setupAPIClient();
                
                // Busca em paralelo: Dados do Cliente e Permissões do Usuário
                const [clientRes, permRes] = await Promise.all([
                    apiClient.get('/client', { params: { client_id: clientId } }),
                    apiClient.get('/permission')
                ]);

                setClientData(clientRes.data.client);
                setPerms(permRes.data.permission);
            } catch (error) {
                console.error("Erro ao carregar dados do cliente", error);
            } finally {
                setLoading(false);
            }
        }

        if (clientId) {
            fetchData();
        }
    }, [clientId]);

    if (loading || !clientData) {
        return <LoadingSpinner />;
    }

    return (
        <Box p={4}>
            <ClientTabs client={clientData} perms={perms} />
        </Box>
    );
}