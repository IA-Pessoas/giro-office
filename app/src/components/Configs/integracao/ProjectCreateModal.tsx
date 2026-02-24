import React, { useState, useEffect } from 'react';
import { 
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
    FormControl, FormLabel, Input, Button, VStack, Box, Text, 
    useToast, Spinner, Select, Table, Thead, Tbody, Tr, Th, Td, IconButton, Flex, Badge, Textarea, SimpleGrid
} from '@chakra-ui/react';
import { IoAdd, IoTrash } from "react-icons/io5";

import { setupAPIClient } from '../../../services/api';
import { useTaskModels, TaskModel } from '../../../hooks/integracao/useTaskModels';

interface ProjectCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientId: string;
    clientProspectingStatus: string;
    onSuccess: () => void;
    initialData?: any; 
}

// Interface para controlar as tarefas na lista da modal
interface ProjectTaskItem {
    tempId: string;
    modelId: string;
    modelName: string;
    departmentName: string;
    observation: string;
    isExisting: boolean;
    originalId?: string;
    status?: string; 
}

interface UserOption {
    id: string;
    name: string;
}

export function ProjectCreateModal({ isOpen, onClose, clientId, clientProspectingStatus, onSuccess, initialData }: ProjectCreateModalProps) {
    const toast = useToast();
    const { models, isLoading: isLoadingModels } = useTaskModels();
    
    // --- ESTADOS DO PROJETO ---
    const [projectName, setProjectName] = useState('');
    const [projectObjective, setProjectObjective] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [sponsorId, setSponsorId] = useState('');
    
    const [projectTasks, setProjectTasks] = useState<ProjectTaskItem[]>([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    
    // --- ESTADOS AUXILIARES ---
    const [users, setUsers] = useState<UserOption[]>([]);
    
    // --- ESTADOS DA TAREFA NOVA ---
    const [selectedModelId, setSelectedModelId] = useState('');
    const [currentObservation, setCurrentObservation] = useState('');
    
    const [isSaving, setIsSaving] = useState(false);
    const isEditing = !!initialData;

    // 1. Carregar Dados ao Abrir (Usuários + Detalhes do Projeto)
    useEffect(() => {
        if (isOpen) {
            // Resetar campos
            setProjectName('');
            setProjectObjective('');
            setStartDate('');
            setEndDate('');
            setSponsorId('');
            setProjectTasks([]);
            
            setSelectedModelId('');
            setCurrentObservation('');

            // Função para buscar usuários (para o Sponsor)
            const fetchUsers = async () => {
                try {
                    const apiClient = setupAPIClient();
                    const response = await apiClient.get('/users', { params: { status: 'Ativo' } });
                    setUsers(response.data);
                } catch (error) {
                    console.error("Erro ao buscar usuários");
                }
            };
            fetchUsers();

            if (initialData) {
                // Preencher campos com dados existentes
                setProjectName(initialData.name || '');
                setProjectObjective(initialData.objective || '');
                setSponsorId(initialData.sponsor_id || '');
                
                // Formata datas para o input type="date" (YYYY-MM-DD)
                if (initialData.start_date) {
                    setStartDate(new Date(initialData.start_date).toISOString().split('T')[0]);
                }
                if (initialData.end_date) {
                    setEndDate(new Date(initialData.end_date).toISOString().split('T')[0]);
                } else {
                    setEndDate('');
                }
                
                // Busca os detalhes completos do projeto (incluindo tarefas)
                fetchProjectDetails(initialData.id);
            }
        }
    }, [isOpen, initialData]);

    const fetchProjectDetails = async (projectId: string) => {
        setIsLoadingDetails(true);
        try {
            const apiClient = setupAPIClient();
            const response = await apiClient.get('/integracao-project', {
                params: { project_id: projectId }
            });

            const project = response.data.detail || response.data;

            if (project && project.tasks) {
                const formattedTasks = project.tasks.map((t: any) => ({
                    tempId: t.id,
                    modelId: t.model_id,
                    // Mapeamento corrigido conforme solicitado
                    modelName: t.model?.name || t.name, 
                    departmentName: t.department?.name || t.model?.department?.name || 'Geral',
                    observation: t.observations || '',
                    isExisting: true,
                    originalId: t.id,
                    status: t.status
                }));
                setProjectTasks(formattedTasks);
            }
        } catch (error) {
            console.error(error);
            toast({ title: 'Erro ao carregar tarefas do projeto.', status: 'error' });
        } finally {
            setIsLoadingDetails(false);
        }
    };

    // 2. Adicionar Tarefa na Lista (Visualmente)
    const handleAddTaskToList = () => {
        if (!selectedModelId) {
            toast({ title: 'Selecione uma tarefa modelo.', status: 'warning' });
            return;
        }

        const alreadyAdded = projectTasks.find(t => t.modelId === selectedModelId);
        if (alreadyAdded) {
            toast({ title: 'Esta tarefa já foi adicionada ao projeto.', status: 'info' });
            return;
        }

        const model = models.find(m => m.id === selectedModelId);
        if (!model) return;

        const newTask: ProjectTaskItem = {
            tempId: `new_${Date.now()}`,
            modelId: model.id,
            // Mapeamento corrigido conforme solicitado
            modelName: model.name || model.name, 
            departmentName: model.department?.name || 'Geral', 
            observation: currentObservation,
            isExisting: false,
            status: 'Nova'
        };

        setProjectTasks(prev => [...prev, newTask]);
        
        // Limpa campos para próxima inserção
        setSelectedModelId('');
        setCurrentObservation('');
    };

    // 3. Remover Tarefa
    const handleRemoveTask = async (item: ProjectTaskItem) => {
        if (item.isExisting && item.originalId) {
            if (!confirm("Essa tarefa já está salva no banco. Deseja excluí-la permanentemente?")) {
                return;
            }
            
            try {
                const apiClient = setupAPIClient();
                await apiClient.delete('/integracao-task', { data: { task_id: item.originalId } });
                toast({ title: 'Tarefa removida do sistema.', status: 'success' });
            } catch (error) {
                toast({ title: 'Erro ao remover tarefa.', status: 'error' });
                return;
            }
        }

        setProjectTasks(prev => prev.filter(t => t.tempId !== item.tempId));
    };

    // 4. Salvar Tudo
    const handleSave = async () => {
        if (!projectName.trim()) {
            toast({ title: 'Digite o nome do projeto.', status: 'warning' });
            return;
        }
        if (projectTasks.length === 0) {
            toast({ title: 'O projeto precisa ter ao menos uma tarefa.', status: 'warning' });
            return;
        }

        setIsSaving(true);
        const apiClient = setupAPIClient();

        try {
            let projectId = initialData?.id;

            // Dados do projeto (Payload)
            const projectData = {
                name: projectName,
                objective: projectObjective,
                sponsor_id: sponsorId || null,
                start_date: startDate ? new Date(startDate) : null,
                end_date: endDate ? new Date(endDate) : null,
            };

            // A) Salvar/Criar Projeto
            if (isEditing) {
                await apiClient.put('/integracao-projects', {
                    project_id: projectId,
                    ...projectData
                });
            } else {
                const projectRes = await apiClient.post('/integracao-projects', {
                    client_id: clientId,
                    ...projectData
                });
                projectId = projectRes.data.create?.id || projectRes.data.id;
            }

            if (!projectId) throw new Error("ID do projeto inválido.");

            // B) Criar APENAS as tarefas novas (isExisting === false)
            const newTasks = projectTasks.filter(t => !t.isExisting);

            if (newTasks.length > 0) {
                await Promise.all(newTasks.map(task => {
                    return apiClient.post('/integracao-tasks', {
                        model_id: task.modelId,
                        project_id: projectId,
                        client_id: clientId,
                        prospecting_status: clientProspectingStatus,
                        observations: task.observation,
                        urgency: 'Normal'
                    });
                }));
            }

            toast({ title: 'Salvo com sucesso!', status: 'success' });
            onSuccess();
            onClose();

        } catch (error: any) {
            console.error(error);
            const msg = error.response?.data?.error || 'Erro ao salvar projeto.';
            toast({ title: 'Erro', description: msg, status: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl">
            <ModalOverlay />
            <ModalContent bg="bodyBg" color="bodyText" maxW="900px">
                <ModalHeader>{isEditing ? 'Gerenciar Projeto' : 'Novo Projeto de Integração'}</ModalHeader>
                <ModalBody>
                    <VStack spacing={6} align="stretch">
                        
                        {/* --- DADOS DO PROJETO --- */}
                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>Nome do Projeto</FormLabel>
                                <Input 
                                    placeholder="Ex: Abertura de Filial..." 
                                    value={projectName}
                                    onChange={e => setProjectName(e.target.value)}
                                    borderColor="mainOpacity"
                                />
                            </FormControl>

                            <FormControl>
                                <FormLabel>Patrocinador (Sponsor)</FormLabel>
                                <Select 
                                    placeholder="Selecione o responsável..."
                                    value={sponsorId}
                                    onChange={e => setSponsorId(e.target.value)}
                                    borderColor="mainOpacity"
                                >
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </Select>
                            </FormControl>
                        </SimpleGrid>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            <FormControl>
                                <FormLabel>Data de Início</FormLabel>
                                <Input 
                                    type="date"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                    borderColor="mainOpacity"
                                />
                            </FormControl>

                            <FormControl>
                                <FormLabel>Data de Fim (Previsão)</FormLabel>
                                <Input 
                                    type="date"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    borderColor="mainOpacity"
                                />
                            </FormControl>
                        </SimpleGrid>

                        <FormControl>
                            <FormLabel>Objetivo / Descrição</FormLabel>
                            <Textarea 
                                placeholder="Descreva o objetivo deste projeto..." 
                                value={projectObjective}
                                onChange={e => setProjectObjective(e.target.value)}
                                borderColor="mainOpacity"
                                rows={2}
                            />
                        </FormControl>

                        {/* --- ÁREA DE TAREFAS --- */}
                        <Box p={4} borderWidth="1px" borderColor="mainOpacity" borderRadius="md" bg="componentColorDarkOnly">
                            <Text fontWeight="bold" mb={3}>Adicionar Tarefa ao Projeto</Text>
                            <Flex gap={4} direction={{ base: 'column', md: 'row' }} alignItems="flex-end">
                                <FormControl flex={2}>
                                    <FormLabel fontSize="sm">Modelo de Tarefa</FormLabel>
                                    <Select 
                                        placeholder={isLoadingModels ? "Carregando..." : "Selecione a tarefa..."}
                                        value={selectedModelId}
                                        onChange={e => setSelectedModelId(e.target.value)}
                                        borderColor="mainOpacity"
                                        size="sm"
                                    >
                                        {models.map(model => (
                                            <option key={model.id} value={model.id}>
                                                {model.name} {model.department?.name ? `(${model.department.name})` : ''}
                                            </option>
                                        ))}
                                    </Select>
                                </FormControl>

                                <FormControl flex={2}>
                                    <FormLabel fontSize="sm">Observação Específica</FormLabel>
                                    <Input 
                                        placeholder="Detalhes específicos..."
                                        value={currentObservation}
                                        onChange={e => setCurrentObservation(e.target.value)}
                                        borderColor="mainOpacity"
                                        size="sm"
                                    />
                                </FormControl>

                                <Button 
                                    leftIcon={<IoAdd />} 
                                    colorScheme="green" 
                                    size="sm" 
                                    onClick={handleAddTaskToList}
                                    isLoading={isLoadingModels}
                                >
                                    Adicionar
                                </Button>
                            </Flex>
                        </Box>

                        {/* Lista de Tarefas do Projeto */}
                        <Box>
                            <Text mb={2} fontSize="sm" color="gray.500">Tarefas no Projeto:</Text>
                            
                            {isLoadingDetails ? (
                                <Flex justify="center" p={4}><Spinner /></Flex>
                            ) : (
                                <Box 
                                    maxH="300px" 
                                    overflowY="auto" 
                                    borderWidth="1px" 
                                    borderColor="mainOpacity" 
                                    borderRadius="md"
                                >
                                    <Table variant="simple" size="sm">
                                        <Thead bg="componentColorDarkOnly">
                                            <Tr>
                                                <Th color="primaryText">Tarefa</Th>
                                                <Th color="primaryText">Observação</Th>
                                                <Th color="primaryText">Status</Th>
                                                <Th width="50px"></Th>
                                            </Tr>
                                        </Thead>
                                        <Tbody>
                                            {projectTasks.length === 0 ? (
                                                <Tr>
                                                    <Td colSpan={4} textAlign="center" py={6} color="gray.500">
                                                        Nenhuma tarefa vinculada.
                                                    </Td>
                                                </Tr>
                                            ) : (
                                                projectTasks.map((task) => (
                                                    <Tr key={task.tempId}>
                                                        <Td>
                                                            <Text fontWeight="bold" fontSize="sm">{task.modelName}</Text>
                                                            <Text fontSize="xs" color="gray.500">{task.departmentName}</Text>
                                                        </Td>
                                                        <Td>{task.observation || '-'}</Td>
                                                        <Td>
                                                            {task.isExisting ? (
                                                                <Badge colorScheme={task.status === 'Concluída' ? 'green' : 'blue'}>
                                                                    {task.status || 'Salva'}
                                                                </Badge>
                                                            ) : (
                                                                <Badge colorScheme="purple">Nova</Badge>
                                                            )}
                                                        </Td>
                                                        <Td>
                                                            <IconButton
                                                                aria-label="Remover"
                                                                icon={<IoTrash />}
                                                                size="xs"
                                                                colorScheme="red"
                                                                variant="ghost"
                                                                onClick={() => handleRemoveTask(task)}
                                                            />
                                                        </Td>
                                                    </Tr>
                                                ))
                                            )}
                                        </Tbody>
                                    </Table>
                                </Box>
                            )}
                        </Box>

                    </VStack>
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" mr={3} onClick={onClose} isDisabled={isSaving}>
                        Fechar
                    </Button>
                    <Button 
                        bg="integracao.main" 
                        color="white" 
                        _hover={{ bg: 'integracao.sub' }} 
                        isLoading={isSaving}
                        loadingText="Salvando..."
                        onClick={handleSave}
                    >
                        {isEditing ? 'Salvar Alterações' : 'Criar Projeto'}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}