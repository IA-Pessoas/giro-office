import React, { useState, useMemo } from 'react'
import Head from 'next/head'
import { useDisclosure } from '@chakra-ui/react';
import { FaUsers } from 'react-icons/fa';
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';

import { canSSRAuth } from '@modules/auth'
import { setupAPIClient } from '@shared/services/api'
import { ClientFilters, ClientList, ClientDetailsView, ClientCreateModal, clientService, type ClientItem, type Perms } from '@modules/clients'

interface Props {
    clients: ClientItem[]
    permList: Perms
}

export default function clients({ clients, permList }: Props) {
    const [clientsList, setclientsList] = useState<ClientItem[]>(clients || [])
    const [selected, setSelected] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('Ativo');
    const [filterLabel, setFilterLabel] = useState('Ativo');    
    const [isListLoading, setIsListLoading] = useState(false);

    const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();


    const isDesktopListCollapsed = !!selected;

    const filtered = useMemo(() => {
        return clientsList.filter(client =>
            client.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [clientsList, searchTerm]);

    const handleUserCreated = (newClient: ClientItem) => {
        setclientsList(currentList => [newClient, ...currentList]);
    };

    const handleFilterChange = async (filters: { status: string; label?: string }) => {
        const { status, label } = filters;
        const newLabel = label || status;

        setIsListLoading(true);
        try {
            const response = await clientService.list({ status, page: 1, limit: 20 });
            setclientsList(response.data);
            setFilterStatus(status);
            setFilterLabel(newLabel);
            toast.success(`Filtro aplicado.`);
        } catch (error) {
            toast.error("Erro ao buscar clientes.");
        } finally {
            setIsListLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Clientes</title>
            </Head>

            <section className="clients-shell u-split-panel relative">
                <aside
                    className={`clients-sidebar group relative z-20 flex flex-col items-center justify-center overflow-hidden transition-all duration-300 md:h-[95vh] ${isDesktopListCollapsed ? 'md:absolute md:w-[80px] md:min-w-[80px]' : 'md:w-[90%] md:min-w-[90%]'}`}
                >
                    <div className={`absolute hidden h-20 w-20 items-center justify-center transition-opacity md:flex ${isDesktopListCollapsed ? 'opacity-100 group-hover:opacity-0' : 'opacity-0'}`}>
                        <FaUsers size={28} color="var(--colors-blue-500)" />
                    </div>

                    <div className={`h-full w-full transition-opacity duration-300 ${isDesktopListCollapsed ? 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto' : 'opacity-100'}`}>
                        <ClientFilters
                            initialLabel={filterLabel}
                            perm={permList}
                            onSearchChange={setSearchTerm}
                            onFilterChange={handleFilterChange}
                            onOpenCreateModal={onModalOpen}
                        />
                        {isListLoading ? (
                            <div className="u-flex h-[150px] items-center justify-center" aria-live="polite">
                                <span className="text-sm text-slate-500">Carregando...</span>
                            </div>
                        ) : (
                            <ClientList
                                clients={filtered}
                                onSelect={setSelected}
                            />
                        )}
                    </div>
                </aside>

                <section className={`flex-1 transition-all duration-300 ${isDesktopListCollapsed ? 'md:pl-[80px]' : 'md:pl-0'}`}>
                    <ClientDetailsView clientId={selected} />                
                </section>
            </section>

            <ClientCreateModal
                isOpen={isModalOpen}
                onClose={onModalClose}
                onCreated={handleUserCreated}
                perm={permList}
            />
        </>
    )
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    try {
        const apiClient = setupAPIClient(ctx);

        const [meResponse, permResponse, clientsResponse] = await Promise.all([
            apiClient.get('/me'),
            apiClient.get('/permission'),
            apiClient.get('/clients', { params: { status: 'Ativo', page: 1, limit: 20 } })
        ])

        return {
            props: {
                clients: clientsResponse.data.data,
                permList: permResponse.data.permission
            }
        }

    } catch (error) {
        console.log(error);
        return {
            redirect: {
                destination: '/dashboard',
                permanent: false
            }
        }
    }
})