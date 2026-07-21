import React, { useEffect, useState } from 'react';
import { ClientTabs } from '../../../components/Tabs/ClientTabs';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { clientService } from '../services/clientService';
import { setupAPIClient } from '@shared/services/api';
import type { Client, Perms } from '../types';

interface ClientProfileProps {
    clientId: string;
}

export function ClientProfile({ clientId }: ClientProfileProps) {
    const [clientData, setClientData] = useState<Client | null>(null);
    const [perms, setPerms] = useState<Perms | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                const apiClient = setupAPIClient();
                
                const [clientData, permRes] = await Promise.all([
                    clientService.getById(clientId),
                    apiClient.get('/permission')
                ]);

                setClientData(clientData);
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
        <div className="p-4">
            <ClientTabs client={clientData} perms={perms} />
        </div>
    );
}