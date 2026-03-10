import React, { useState, useMemo } from 'react'
import Head from 'next/head'
import { Box, Flex, useDisclosure, Spinner, Icon } from '@chakra-ui/react';
import { FaUsers } from 'react-icons/fa';
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';

import { canSSRAuth } from '../../utils/canSSRAuth'
import { setupAPIClient } from '../../services/api'
import { 
  DepList, 
  DepFilters, 
  DepDetailsView, 
  CreateDepModal,
  departmentService,
  type DepItem 
} from '@features/departments';
interface Props {
    deps: DepItem[]
}

export default function Departaments({ deps }: Props) {
    const [depsList, setDepsList] = useState<DepItem[]>(deps || [])
    const [selected, setSelected] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('Ativo');
    const [isListLoading, setIsListLoading] = useState(false);

    const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();

    const isDesktopListCollapsed = !!selected;

    const filtered = useMemo(() => {
        return depsList.filter(dep =>
            dep.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [depsList, searchTerm]);

    const handleUserCreated = (newDep: DepItem) => {
        if (filterStatus === 'Ativo') {
            setDepsList(currentList => [newDep, ...currentList]);
        } else {
            toast.info(`Usuário ${newDep.name} criado, mude o filtro para 'Ativos' para vê-lo.`);
        }
    };

    const handleFilterChange = async (status: string) => {
        setIsListLoading(true);
        try {
            const deps = await departmentService.list({ status });
            setDepsList(deps);
            setFilterStatus(status);
            toast.success(`Filtro '${status}' aplicado.`);
        } catch (error) {
            toast.error("Erro ao buscar departamentos.");
        } finally {
            setIsListLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Departamentos</title>
            </Head>

            <Flex
                direction={{ base: 'column', md: 'row' }}
                w="99%"
                h={{ md: "90vh" }}
                gap={3}
                position="relative"
            >
                <Flex
                    direction="column"
                    role="group"
                    position={{ base: 'relative', md: isDesktopListCollapsed ? 'absolute' : 'relative' }}
                    w={{ base: '100%', md: isDesktopListCollapsed ? '80px' : '350px' }}
                    minW={{ md: isDesktopListCollapsed ? '80px' : '350px' }}
                    h={{ base: 'auto', md: '90vh' }}
                    zIndex="20"
                    bg="componentColorDarkOnly"
                    boxShadow="md"
                    borderRadius="md"
                    justifyContent={'center'}
                    alignItems={'center'}
                    transition="all 0.3s ease-in-out"
                    _hover={{ w: { md: '350px' }, }}
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
                        w={{ base: '100%', md: '350px' }}
                        h="100%"
                        opacity={isDesktopListCollapsed ? 0 : 1}
                        pointerEvents={isDesktopListCollapsed ? 'none' : 'auto'}
                        _groupHover={{ opacity: 1, pointerEvents: 'auto' }}
                        transition="opacity 0.3s ease-in-out"
                        bg={'componentColorDarkOnly'}
                    >
                        <DepFilters
                            initialStatus={filterStatus}
                            onFilterChange={handleFilterChange}
                            onSearchChange={setSearchTerm}
                            onOpenCreateModal={onModalOpen}
                        />
                        {isListLoading ? (
                            <Flex justify="center" align="center" h="150px"><Spinner size="xl" /></Flex>
                        ) : (
                            <DepList
                                deps={filtered}
                                onDepSelect={setSelected}
                            />
                        )}
                    </Flex>
                </Flex>

                <Box
                    flex="1"
                    pl={{ base: 0, md: isDesktopListCollapsed ? '80px' : 0 }}
                    transition="padding-left 0.3s ease-in-out"
                >
                    <DepDetailsView depId={selected} />
                </Box>
            </Flex>

            <CreateDepModal
                isOpen={isModalOpen}
                onClose={onModalClose}
                onCreated={handleUserCreated}
            />
        </>
    )
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    try {
        const apiClient = setupAPIClient(ctx);

        const [meResponse, depsResponse] = await Promise.all([
            apiClient.get('/me'),
            apiClient.get('/departments', { params: { status: 'Ativo' } })
        ])

        if (depsResponse.data === null || meResponse.data.user.permission === 0) {
            return {
                redirect: {
                    destination: '/dashboard',
                    permanent: false,
                }
            }
        }

        return {
            props: {
                deps,
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