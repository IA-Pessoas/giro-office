import React, { useState, useEffect } from 'react';
import { IoAdd, IoTrash } from "react-icons/io5";

import { setupAPIClient } from '@shared/services/api';
import { integracaoService } from '../services/integracaoService';
import { useTaskModels } from '../hooks/useTaskModels';
import type { TaskModel, ProjectTaskItem } from '../types';
import { toast as toastifyToast } from 'react-toastify';

// --- Chakra shims local (para remover dependência de @chakra-ui/react sem reescrever toda a UI) ---
type AnyProps = Record<string, any>;

const Modal = ({ isOpen, children }: AnyProps) => {
    if (!isOpen) return null;
    return <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>{children}</div>;
};
const ModalOverlay = () => <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />;
const ModalContent = ({ children, ...rest }: AnyProps) => (
    <div
        style={{
            position: 'relative',
            margin: '5vh auto',
            maxWidth: rest.maxW ?? 900,
            background: '#fff',
            color: '#0f172a',
            borderRadius: 12,
            overflow: 'hidden',
        }}
    >
        {children}
    </div>
);
const ModalHeader = ({ children }: AnyProps) => (
    <div style={{ padding: '1rem', fontWeight: 800, borderBottom: '1px solid #e2e8f0' }}>{children}</div>
);
const ModalBody = ({ children }: AnyProps) => <div style={{ padding: '1rem' }}>{children}</div>;
const ModalFooter = ({ children }: AnyProps) => <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>{children}</div>;

const Box = ({ children, style, ...props }: AnyProps) => (
    <div style={{ ...(style ?? {}) }} {...props}>
        {children}
    </div>
);
const Text = ({ children, style, ...props }: AnyProps) => (
    <p style={{ margin: 0, ...(style ?? {}) }} {...props}>
        {children}
    </p>
);
const Badge = ({ children, colorScheme, style, ...props }: AnyProps) => (
    <span
        style={{
            display: 'inline-block',
            padding: '0.15rem 0.55rem',
            borderRadius: 8,
            fontSize: '0.8rem',
            background: colorScheme === 'green' ? '#dcfce7' : colorScheme === 'purple' ? '#f5f3ff' : '#dbeafe',
            color: '#1f2937',
            ...(style ?? {}),
        }}
        {...props}
    >
        {children}
    </span>
);

const Flex = ({ children, style, direction, gap, ...props }: AnyProps) => (
    <div
        style={{
            display: 'flex',
            flexDirection: direction ?? props.flexDirection ?? 'row',
            gap: typeof gap === 'number' ? `${gap}px` : gap,
            alignItems: props.alignItems,
            ...(style ?? {}),
        }}
        {...props}
    >
        {children}
    </div>
);

const VStack = ({ children, spacing, ...props }: AnyProps) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing ?? 12 }} {...props}>
        {children}
    </div>
);

const SimpleGrid = ({ children, columns, ...props }: AnyProps) => {
    const cols = typeof columns === 'number' ? columns : columns?.md ?? columns?.base ?? 2;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }} {...props}>
            {children}
        </div>
    );
};

const FormControl = ({ children, ...props }: AnyProps) => <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} {...props}>{children}</div>;
const FormLabel = ({ children, ...props }: AnyProps) => <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>{children}</label>;

const Input = React.forwardRef<HTMLInputElement, AnyProps>(({ style, ...props }, ref) => (
    <input
        ref={ref}
        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.55rem 0.7rem', ...(style ?? {}) }}
        {...props}
    />
));
Input.displayName = 'InputShim';

const Select = React.forwardRef<HTMLSelectElement, AnyProps>(({ style, ...props }, ref) => (
    <select
        ref={ref}
        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.55rem 0.7rem', background: '#fff', ...(style ?? {}) }}
        {...props}
    />
));
Select.displayName = 'SelectShim';

const Textarea = React.forwardRef<HTMLTextAreaElement, AnyProps>(({ style, ...props }, ref) => (
    <textarea
        ref={ref}
        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.55rem 0.7rem', ...(style ?? {}) }}
        {...props}
    />
));
Textarea.displayName = 'TextareaShim';

const Button = ({ children, style, isLoading, isDisabled, disabled, ...props }: AnyProps) => (
    <button
        type={props.type ?? 'button'}
        disabled={disabled || isDisabled || isLoading}
        onClick={props.onClick}
        style={{
            border: '1px solid transparent',
            borderRadius: 8,
            padding: '0.6rem 0.85rem',
            background: props.bg ?? '#ef5a8b',
            color: props.color ?? '#fff',
            cursor: disabled || isDisabled || isLoading ? 'not-allowed' : 'pointer',
            opacity: disabled || isDisabled || isLoading ? 0.7 : 1,
            ...(style ?? {}),
        }}
        {...props}
    >
        {isLoading ? '...' : children}
    </button>
);

const Spinner = ({ ...props }: AnyProps) => <div style={{ padding: 8 }}>Carregando...</div>;

const Table = ({ children, ...props }: AnyProps) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }} {...props}>
        {children}
    </table>
);
const Thead = ({ children, ...props }: AnyProps) => <thead {...props}>{children}</thead>;
const Tbody = ({ children, ...props }: AnyProps) => <tbody {...props}>{children}</tbody>;
const Tr = ({ children, ...props }: AnyProps) => <tr {...props}>{children}</tr>;
const Th = ({ children, ...props }: AnyProps) => (
    <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem', borderBottom: '1px solid #e2e8f0' }} {...props}>
        {children}
    </th>
);
const Td = ({ children, ...props }: AnyProps) => (
    <td style={{ textAlign: 'left', padding: '0.5rem 0.35rem', borderBottom: '1px solid #f1f5f9' }} {...props}>
        {children}
    </td>
);

const IconButton = ({ icon, ...props }: AnyProps) => (
    <button
        type="button"
        aria-label={props['aria-label']}
        onClick={props.onClick}
        style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: props.colorScheme === 'red' ? '#dc2626' : '#2f406a',
            padding: 4,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}
    >
        {icon}
    </button>
);

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
    // Compat: o código foi escrito para `useToast()` do Chakra (toast({ title, status, description }))
    // Então mapeamos as opções para o `react-toastify`.
    const toast = (opts: any) => {
        const title = opts?.title ?? '';
        const description = opts?.description ?? '';
        const status = opts?.status ?? '';

        const text = description ? `${title}: ${description}` : title;

        switch (status) {
            case 'success':
                return toastifyToast.success(text);
            case 'error':
                return toastifyToast.error(text);
            case 'warning':
                // react-toastify usa `warn`
                return toastifyToast.warn(text);
            case 'info':
                return toastifyToast.info(text);
            default:
                return toastifyToast(text);
        }
    };
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
                    const response = await apiClient.get('/user/users', { params: { status: 'Ativo' } });
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
            const response = await apiClient.get('/project/project', {
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
                await apiClient.delete('/task/task', { data: { task_id: item.originalId } });
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
                await integracaoService.projects.update({
                    id: projectId,
                    ...projectData
                });
            } else {
                const newProject = await integracaoService.projects.create({
                    client_id: clientId,
                    ...projectData
                });
                projectId = newProject.id;
            }

            if (!projectId) throw new Error("ID do projeto inválido.");

            // B) Criar APENAS as tarefas novas (isExisting === false)
            const newTasks = projectTasks.filter(t => !t.isExisting);

            if (newTasks.length > 0) {
                await Promise.all(newTasks.map(task => {
                    return apiClient.post('/task/tasks', {
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
