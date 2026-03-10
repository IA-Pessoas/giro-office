import React, { useState, useEffect } from 'react';
import { Box, Flex, FormControl, FormLabel, Input, Switch, SimpleGrid, Select, Button } from '@chakra-ui/react';
import { IoCreate } from "react-icons/io5";

import LogDrawer from '@/components/LogDrawer';
import { LoadingSpinner } from '../../layout/LoadingSpinner';

import { useClientFormComercial } from '../../../hooks/clients/useFormComercial';
import { setupAPIClient } from '@shared/services/api';
import { Client, Perms } from '../../../services/types/clientTabs';
import { formatDateToInput } from '@/utils/formatters';

interface ClientTabProps {
  client: Client;
  perms: Perms;
}

export const comercialTab = ({ client, perms }: ClientTabProps) => {    
    const {
        formData,
        isLoading,
        handleInputChange,
        handleUpdate
    } = useClientFormComercial(client);

    const apiClient = setupAPIClient();
    const [isLoadingPage, setIsLoadingPage] = useState(true);
    const [integrationData, setIntegrationData] = useState(null);

    useEffect(() => {
        const fetchIntegrationData = async () => {
            try {
                const response = await apiClient.get('/integracao-projects', {
                    params: {
                        ref: 'client',
                        id: client.id
                    }
                });                
                setIntegrationData(response.data);
            } catch (error) {
                console.error("Erro ao buscar dados de integração", error);
            } finally {
                setIsLoadingPage(false);
            }
        };

        fetchIntegrationData();
    }, []);
    
    if (isLoadingPage) {
        return <LoadingSpinner />;
    }

    return (
        <Box p={4}>
            <Flex direction="column" alignItems="center" pt={4} pb={8} w="100%" maxWidth="100%" mx="auto">
                <Flex as="form" direction="column" w="100%" gap={4} onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
                    <SimpleGrid columns={{ base: 3, md: 3, lg: 3 }} gap={4}>
                        <FormControl>
                            <FormLabel>Status</FormLabel>
                            <Select name="name" value={formData.prospecting_status} onChange={handleInputChange} color={'bodyText'}>
                                <option value="Análise/Agendamento">Análise/Agendamento</option>
                                <option value="Envio de Proposta">Envio de Proposta</option>
                                <option value="Análise Financeira">Análise Financeira</option>
                                <option value="Fechado">Fechado</option>
                                <option value="Paralisado">Paralisado</option>
                                <option value="Recusado pelo Cliente">Recusado pelo Cliente</option>
                                <option value="Baixada">Baixada</option>
                                <option value="Inativo">Inativo</option>
                            </Select>
                        </FormControl>
                        <FormControl>
                            <FormLabel>Data do Status da Prospecção:</FormLabel>
                            <Input name="date_status" type="datetime-local" value={formData.date_status} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Descrição da Prospecção:</FormLabel>
                            <Input name="description_prospecting" value={formData.description_prospecting} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                    </SimpleGrid>

                    <Flex mt={6} justify="space-between" align="center">
                        <LogDrawer referring="clients" referringId={client.id} />
                        <Button
                            type="submit"
                            leftIcon={<IoCreate />}
                            size="lg"
                            bg="componentColor"
                            color="white"
                            isLoading={isLoading}
                            _hover={{ bg: 'componentColorReverse' }}
                        >
                            Salvar Alterações
                        </Button>
                    </Flex>
                </Flex>
            </Flex>
        </Box>
    )
}