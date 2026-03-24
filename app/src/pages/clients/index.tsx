import React, { useState, useMemo } from 'react'
import Head from 'next/head'
import { Box, Flex, useDisclosure, Spinner, Icon } from '@chakra-ui/react';
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

            <Flex
                direction={{ base: 'column', md: 'row' }}
                w="99%"
                h={{ md: "95vh" }}
                gap={3}
                position="relative"
            >
                <Flex
                    direction="column"
                    role="group"
                    position={{ base: 'relative', md: isDesktopListCollapsed ? 'absolute' : 'relative' }}
                    w={{ base: '90%', md: isDesktopListCollapsed ? '80px' : '90%' }}
                    minW={{ md: isDesktopListCollapsed ? '80px' : '90%' }}
                    h={{ base: 'auto', md: '95vh' }}
                    zIndex="20"
                    bg="componentColorDarkOnly"
                    boxShadow="md"
                    borderRadius="md"
                    justifyContent={'center'}
                    alignItems={'center'}
                    transition="all 0.3s ease-in-out"
                    _hover={{ w: { md: '90%' }, }}
                    overflow="hidden"
                >
                    <Flex
                        position="absolute"
                        w="80px" h="80px"
                        align="center" justify="center"
                        display={{ base: 'none', md: 'flex' }}
                        opacity={isDesktopListCollapsed ? 1 : 0}
                        pointerEvents="none"
                        _groupHover={{ opacity: 0 }}
                        transition="opacity 0.2s"
                    >
                        <Icon as={FaUsers} boxSize={7} color="primaryText" />
                    </Flex>

                    <Flex
                        direction="column"
                        w={{ base: '100%', md: '100%' }}
                        h="100%"
                        opacity={isDesktopListCollapsed ? 0 : 1}
                        pointerEvents={isDesktopListCollapsed ? 'none' : 'auto'}
                        _groupHover={{ opacity: 1, pointerEvents: 'auto' }}
                        transition="opacity 0.3s ease-in-out"
                        bg={'componentColorDarkOnly'}
                    >
                        <ClientFilters
                            initialLabel={filterLabel}
                            perm={permList}
                            onSearchChange={setSearchTerm}
                            onFilterChange={handleFilterChange}
                            onOpenCreateModal={onModalOpen}
                        />
                        {isListLoading ? (
                            <Flex justify="center" align="center" h="150px"><Spinner size="xl" /></Flex>
                        ) : (
                            <ClientList
                                clients={filtered}
                                onSelect={setSelected}
                            />
                        )}
                    </Flex>
                </Flex>

                <Box
                    flex="1"
                    pl={{ base: 0, md: isDesktopListCollapsed ? '80px' : 0 }}
                    transition="padding-left 0.3s ease-in-out"
                >
                    <ClientDetailsView clientId={selected} />                
                </Box>
            </Flex>

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