import React, { useState, useEffect } from 'react';
import { Box, Flex, FormControl, FormLabel, Input, Switch, SimpleGrid, Select, Button } from '@chakra-ui/react';
import { IoCreate } from "react-icons/io5";

import LogDrawer from '@shared/components/LogDrawer';
import { LoadingSpinner } from '../../layout/LoadingSpinner';

import { useClientFormRegularize } from '@features/clients';
import { setupAPIClient } from '@shared/services/api';
import type { Client, Perms } from '@features/clients';

interface ClientTabProps {
  client: Client;
  perms: Perms;
}

export const regularizeTab = ({ client, perms }: ClientTabProps) => {    
    const {
        formData,
        isLoading,
        handleInputChange,
        handleUpdate
    } = useClientFormRegularize(client);

    const apiClient = setupAPIClient();
    const [isLoadingPage, setIsLoadingPage] = useState(true);
    const [integrationData, setIntegrationData] = useState(null);

    useEffect(() => {
        setIsLoadingPage(false)
    }, []);
    
    if (isLoadingPage) {
        return <LoadingSpinner />;
    }

    return (
        <Box p={4}>
            <Flex direction="column" alignItems="center" pt={4} pb={8} w="100%" maxWidth="100%" mx="auto">
                <Flex as="form" direction="column" w="100%" gap={4} onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
                    <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={4}>
                        <FormControl>
                            <FormLabel>Código Dominio</FormLabel>
                            <Input name="dominio_code" value={formData.dominio_code} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Nome / Apelido</FormLabel>
                            <Input name="name" value={formData.name} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Razão Social</FormLabel>
                            <Input name="company_name" value={formData.company_name} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Nome Fantasia</FormLabel>
                            <Input name="fantasy_name" value={formData.fantasy_name} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>CNPJ</FormLabel>
                            <Input name="cnpj" value={formData.cnpj} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>CNAE Principal</FormLabel>
                            <Input name="cnae" value={formData.cnae} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>CNAE Secundário</FormLabel>
                            <Input name="cnae_secondary" value={formData.cnae_secondary} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Responsável</FormLabel>
                            <Input name="responsible" value={formData.responsible} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>CPF do Responsável</FormLabel>
                            <Input name="cpf_responsible" value={formData.cpf_responsible} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Telefone</FormLabel>
                            <Input name="number" value={formData.number} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>E-mail</FormLabel>
                            <Input name="email" value={formData.email} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Endereço</FormLabel>
                            <Input name="address" value={formData.address} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>CEP</FormLabel>
                            <Input name="cep" value={formData.cep} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Bairro</FormLabel>
                            <Input name="neighborhood" value={formData.neighborhood} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Estado</FormLabel>
                            <Input name="state" value={formData.state} onChange={handleInputChange} color={'bodyText'} placeholder='Ex: BA' />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Cidade</FormLabel>
                            <Input name="city" value={formData.city} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Inscrição Municipal</FormLabel>
                            <Input name="municipal_registration" value={formData.municipal_registration} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Inscrição Estadual</FormLabel>
                            <Input name="state_registration" value={formData.state_registration} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Cliende Desde</FormLabel>
                            <Input name="customer_since" type="date" value={formData.customer_since} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Data de Abertura</FormLabel>
                            <Input name="opening_date" type="date" value={formData.opening_date} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Regime</FormLabel>
                            <Select name='regime' value={formData.regime} onChange={handleInputChange} color={'bodyText'}>
                                <option value="">Selecione um...</option>
                                <option value="Simples Nacional">Simples Nacional</option>
                                <option value="Lucro Real">Lucro Real</option>
                                <option value="Lucro Presumido">Lucro Presumido</option>
                                <option value="MEI">MEI</option>
                                <option value="E-SOCIAL">E-SOCIAL</option>
                                <option value="CNO">CNO</option>
                                <option value="CAEPF">CAEPF</option>
                            </Select>
                        </FormControl>
                        <FormControl>
                            <FormLabel>Porte</FormLabel>
                            <Select name='size' value={formData.size} onChange={handleInputChange} color={'bodyText'}>
                                <option value="">Selecione um...</option>
                                <option value="DEMAIS">DEMAIS</option>
                                <option value="EPP">EPP</option>
                                <option value="ME">ME</option>
                            </Select>
                        </FormControl>
                        <FormControl>
                            <FormLabel>Segmento</FormLabel>
                            <Select name='segment' value={formData.segment} onChange={handleInputChange} color={'bodyText'}>
                                <option value="">Selecione um...</option>
                                <option value="Contabilidade">Contabilidade</option>
                                <option value="Mercado">Mercado</option>
                                <option value="Infopdruto">Infopdruto</option>
                            </Select>
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="contabil" mb="0">
                                Contábil
                            </FormLabel>
                            <Switch
                                id="contabil"
                                name="contabil"
                                isChecked={formData.contabil}
                                onChange={handleInputChange}
                                colorScheme="green"
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="fiscal" mb="0">
                                Fiscal
                            </FormLabel>
                            <Switch
                                id="fiscal"
                                name="fiscal"
                                isChecked={formData.fiscal}
                                onChange={handleInputChange}
                                colorScheme="green"
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="pessoal" mb="0">
                                Pessoal
                            </FormLabel>
                            <Switch
                                id="pessoal"
                                name="pessoal"
                                isChecked={formData.pessoal}
                                onChange={handleInputChange}
                                colorScheme="green"
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="infoproduto" mb="0">
                                Infoproduto
                            </FormLabel>
                            <Switch
                                id="infoproduto"
                                name="infoproduto"
                                isChecked={formData.infoproduto}
                                onChange={handleInputChange}
                                colorScheme="green"
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="castelo_med" mb="0">
                                Castelo Med
                            </FormLabel>
                            <Switch
                                id="castelo_med"
                                name="castelo_med"
                                isChecked={formData.castelo_med}
                                onChange={handleInputChange}
                                colorScheme="green"
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="consultoria" mb="0">
                                Consultoria
                            </FormLabel>
                            <Switch
                                id="consultoria"
                                name="consultoria"
                                isChecked={formData.consultoria}
                                onChange={handleInputChange}
                                colorScheme="green"
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Inicio Paralisação</FormLabel>
                            <Input name="start_strike" type="date" value={formData.start_strike} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Fim Paralisação</FormLabel>
                            <Input name="end_strike" type="date" value={formData.end_strike} onChange={handleInputChange} color={'bodyText'} />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Data de Exclusão</FormLabel>
                            <Input name="deletion_date" type="date" value={formData.deletion_date} onChange={handleInputChange} color={'bodyText'} />
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