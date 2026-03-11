import React, { useState, useEffect } from 'react';
import {
    Box, Flex, FormControl, FormLabel, Input, Switch, SimpleGrid, Button, Heading,
    useDisclosure, Divider, Text, IconButton, Card, CardBody, Badge, Select
} from '@chakra-ui/react';
import { IoCreate, IoAddCircleOutline, IoPencil, IoFolderOpen } from "react-icons/io5";

import LogDrawer from '@shared/components/LogDrawer';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';

import { useClientFormIntegracao } from '@features/clients';
import { setupAPIClient } from '@shared/services/api';
import type { Client, Perms } from '@features/clients';
import { ProjectCreateModal } from '@features/integracao';

interface ClientTabProps {
    client: Client;
    perms: Perms;
}

export const integracaoTab = ({ client, perms }: ClientTabProps) => {
    const {
        formData,
        isLoading,
        handleInputChange,
        handleUpdate
    } = useClientFormIntegracao(client);

    const {
        isOpen: isProjectModalOpen,
        onOpen: onOpenProjectModal,
        onClose: onCloseProjectModal
    } = useDisclosure();

    const [selectedProject, setSelectedProject] = useState<any>(null);
    const [isLoadingPage, setIsLoadingPage] = useState(true);
    const [integrationData, setIntegrationData] = useState<any[]>([]);

    const apiClient = setupAPIClient();

    const fetchIntegrationData = async () => {
        try {
            const response = await apiClient.get('/integracao-projects', {
                params: {
                    ref: 'client',
                    id: client.id
                }
            });
            const data = Array.isArray(response.data) ? response.data : (response.data.list || []);
            setIntegrationData(data);
        } catch (error) {
            console.error("Erro ao buscar dados de integração", error);
        } finally {
            setIsLoadingPage(false);
        }
    };

    useEffect(() => {
        fetchIntegrationData();
    }, [client.id]);

    const handleEditProject = (project: any) => {
        setSelectedProject(project);
        onOpenProjectModal();
    };

    const handleNewProject = () => {
        setSelectedProject(null);
        onOpenProjectModal();
    };

    if (isLoadingPage) {
        return <LoadingSpinner />;
    }

    return (
        <Box p={4}>
            {/* --- CABEÇALHO --- */}
            <Flex justify="space-between" align="center" mb={6} pb={4} borderBottom="1px solid" borderColor="borderColor">
                <Heading size="md" color="primaryText">Integração</Heading>
                <Button
                    leftIcon={<IoAddCircleOutline />}
                    bg="integracao.main"
                    color="white"
                    _hover={{ bg: 'integracao.sub' }}
                    onClick={handleNewProject}
                >
                    Novo Projeto
                </Button>
            </Flex>

            {/* --- LISTA DE PROJETOS --- */}
            {integrationData.length > 0 && (
                <Box mb={8}>
                    <Heading size="sm" mb={4} color="gray.500" textTransform="uppercase" fontSize="xs">Projetos Ativos</Heading>
                    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                        {integrationData.map((project) => (
                            <Card key={project.id} bg="componentColorDarkOnly" border="1px solid" borderColor="borderColor" boxShadow="sm">
                                <CardBody>
                                    <Flex justify="space-between" align="start">
                                        <Box>
                                            <Flex align="center" gap={2} mb={2}>
                                                <IoFolderOpen color="#d53f8c" />
                                                <Heading size="sm" color="primaryText">{project.name}</Heading>
                                            </Flex>
                                            <Text fontSize="xs" color="gray.500">
                                                {project.tasks?.length || 0} tarefas vinculadas
                                            </Text>
                                        </Box>
                                        <IconButton
                                            aria-label="Editar Projeto"
                                            icon={<IoPencil />}
                                            size="sm"
                                            variant="ghost"
                                            colorScheme="blue"
                                            onClick={() => handleEditProject(project)}
                                        />
                                    </Flex>
                                </CardBody>
                            </Card>
                        ))}
                    </SimpleGrid>
                    <Divider my={6} />
                </Box>
            )}

            {/* --- FORMULÁRIO DE EDIÇÃO --- */}
            <Flex direction="column" pb={8} w="100%" maxWidth="100%" mx="auto">
                <Flex as="form" direction="column" gap={6} onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>

                    {/* 1. Identificação */}
                    <Box>
                        <Heading size="sm" mb={4} color="primaryText">Identificação</Heading>
                        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={4}>
                            <FormControl>
                                <FormLabel>Tipo de Pessoa</FormLabel>
                                <Select name="type" value={formData.type} onChange={handleInputChange} color={'bodyText'}>
                                    <option value="PJ">Pessoa Jurídica</option>
                                    <option value="PF">Pessoa Física</option>
                                </Select>
                            </FormControl>
                            <FormControl>
                                <FormLabel>Tipo de Registro</FormLabel>
                                <Select name="type_registration" value={formData.type_registration} onChange={handleInputChange} color={'bodyText'}>
                                    <option value="Novo">Novo</option>
                                    <option value="Existente">Existente</option>
                                </Select>
                            </FormControl>
                            <FormControl>
                                <FormLabel>Nome / Apelido</FormLabel>
                                <Input name="name" value={formData.name} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>CPF / CNPJ</FormLabel>
                                <Input name="cpf_cnpj" value={formData.cpf_cnpj} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                        </SimpleGrid>

                        {/* Campos extras apenas para PJ */}
                        {formData.type === 'PJ' && (
                            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} mt={4}>
                                <FormControl>
                                    <FormLabel>Razão Social</FormLabel>
                                    <Input name="company_name" value={formData.company_name} onChange={handleInputChange} color={'bodyText'} />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Nome Fantasia</FormLabel>
                                    <Input name="fantasy_name" value={formData.fantasy_name} onChange={handleInputChange} color={'bodyText'} />
                                </FormControl>
                            </SimpleGrid>
                        )}
                    </Box>

                    <Divider borderColor="borderColor" />

                    {/* 2. Contato e Endereço */}
                    <Box>
                        <Heading size="sm" mb={4} color="primaryText">Contato e Endereço</Heading>
                        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                            <FormControl>
                                <FormLabel>Telefone</FormLabel>
                                <Input name="number" value={formData.number} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>E-mail</FormLabel>
                                <Input name="email" value={formData.email} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Instagram</FormLabel>
                                <Input name="instagram" value={formData.instagram} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>CEP</FormLabel>
                                <Input name="cep" value={formData.cep} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl gridColumn={{ lg: "span 2" }}>
                                <FormLabel>Endereço Completo</FormLabel>
                                <Input name="address" value={formData.address} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Bairro</FormLabel>
                                <Input name="neighborhood" value={formData.neighborhood} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Cidade</FormLabel>
                                <Input name="city" value={formData.city} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Estado (UF)</FormLabel>
                                <Input name="state" value={formData.state} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                        </SimpleGrid>
                    </Box>

                    <Divider borderColor="borderColor" />

                    {/* 3. Responsáveis */}
                    <Box>
                        <Heading size="sm" mb={4} color="primaryText">Responsáveis</Heading>
                        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                            <FormControl>
                                <FormLabel>Responsável Legal</FormLabel>
                                <Input name="responsible" value={formData.responsible} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>CPF Responsável</FormLabel>
                                <Input name="cpf_responsible" value={formData.cpf_responsible} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Preposto</FormLabel>
                                <Input name="agent" value={formData.agent} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>CPF Preposto</FormLabel>
                                <Input name="cpf_agent" value={formData.cpf_agent} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                        </SimpleGrid>
                    </Box>

                    <Divider borderColor="borderColor" />

                    {/* 4. Detalhes da Integração */}
                    <Box>
                        <Heading size="sm" mb={4} color="primaryText">Detalhes da Integração</Heading>
                        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={4}>
                            <FormControl>
                                <FormLabel>Indicação</FormLabel>
                                <Input name="indication" value={formData.indication} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Participantes da Reunião</FormLabel>
                                <Input name="participants_meet" value={formData.participants_meet} onChange={handleInputChange} color={'bodyText'} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Tipo de Reunião</FormLabel>
                                <Select name="meet_type" value={formData.meet_type} onChange={handleInputChange} color={'bodyText'}>
                                    <option value="">Selecione...</option>
                                    <option value="Online">Online</option>
                                    <option value="Presencial">Presencial</option>
                                    <option value="Híbrido">Híbrido</option>
                                </Select>
                            </FormControl>

                            <FormControl display="flex" alignItems="center" mt={8}>
                                <FormLabel htmlFor="service_unique" mb="0">
                                    Serviço Único?
                                </FormLabel>
                                <Switch
                                    id="service_unique"
                                    name="service_unique"
                                    isChecked={formData.service_unique}
                                    onChange={handleInputChange}
                                    colorScheme="green"
                                />
                            </FormControl>
                        </SimpleGrid>
                    </Box>

                    {/* Botão Salvar */}
                    <Flex mt={4} justify="space-between" align="center">
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
                            Salvar Dados
                        </Button>
                    </Flex>
                </Flex>
            </Flex>

            {/* MODAL DE PROJETO */}
            <ProjectCreateModal
                isOpen={isProjectModalOpen}
                onClose={onCloseProjectModal}
                clientId={client.id}
                clientProspectingStatus={client.prospecting_status}
                initialData={selectedProject}
                onSuccess={() => {
                    fetchIntegrationData();
                }}
            />
        </Box>
    )
}