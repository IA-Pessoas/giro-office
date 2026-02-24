import React, { useState, useEffect } from 'react';
import { 
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
    FormControl, FormLabel, Input, Select, Button, Textarea, Flex, SimpleGrid,
    Divider, Heading, Table, Thead, Tbody, Tr, Th, Td, IconButton, Checkbox, Box, Text
} from '@chakra-ui/react';
import { IoAdd, IoTrash } from "react-icons/io5";
import { toast } from 'react-toastify';
import { setupAPIClient } from '../../../services/api'; // Ajuste o caminho conforme sua estrutura
import { TaskModel } from '../../../hooks/integracao/useTaskModels'; // Ajuste o caminho

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: TaskModel | null;
    onSave: (data: any) => Promise<boolean>;
}

interface UserOption { id: string; name: string; }
interface DepartmentOption { id: string; name: string; }
interface TaskOption { id: string; name: string; } // Para o select de tarefas

// Interface do Dependente vindo da API (listDependent)
interface TaskDependent {
    id: string; // ID do vínculo
    dependent_id: string;
    wait: boolean;
    observation: string;
    dependent: { // Dados da tarefa dependente (include do prisma)
        name: string;
    };
}

export function TaskModelModal({ isOpen, onClose, initialData, onSave }: ModalProps) {
    // --- ESTADOS DO FORMULÁRIO PRINCIPAL ---
    const [formData, setFormData] = useState({
        name: '',
        department_id: '',
        responsible_id: '',
        responsible2_id: '',
        responsible3_id: '',
        observations: '',
        billing: 'Não Realizar',
        prevision: 0,
        type: 'Projeto' // Adicionado campo type que existia no service
    });

    // --- ESTADOS DE DADOS AUXILIARES ---
    const [users, setUsers] = useState<UserOption[]>([]);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [allTasks, setAllTasks] = useState<TaskOption[]>([]); // Lista de todas as tarefas para selecionar
    
    // --- ESTADOS DE DEPENDENTES ---
    const [dependents, setDependents] = useState<TaskDependent[]>([]);
    const [newDep, setNewDep] = useState({ dependent_id: '', wait: false, observation: '' });
    const [loadingDependents, setLoadingDependents] = useState(false);

    // --- ESTADOS DE CONTROLE ---
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);

    const isEditing = !!initialData;

    // 1. CARREGAR DADOS INICIAIS (Users, Depts, Tasks)
    useEffect(() => {
        async function loadOptions() {
            if (!isOpen) return;
            
            try {
                const apiClient = setupAPIClient();
                setLoadingData(true);

                // Busca usuários e departamentos
                const [usersRes, depsRes, tasksRes] = await Promise.all([
                    apiClient.get('/users', { params: { status: 'Ativo' } }),
                    apiClient.get('/departments', { params: { status: 'Ativo' } }),
                    // Busca tarefas para popular o select de dependentes
                    // Ajuste a rota se necessário, estou usando a listagem padrão
                    apiClient.get('/integracao-tasksModel') 
                ]);

                setUsers(usersRes.data);
                setDepartments(depsRes.data);
                setAllTasks(tasksRes.data); // Assume que retorna array com id e name

            } catch (err) {
                console.error("Erro ao carregar opções:", err);
                toast.error("Erro ao carregar listas.");
            } finally {
                setLoadingData(false);
            }
        }

        loadOptions();
    }, [isOpen]);

    // 2. PREENCHER FORMULÁRIO E CARREGAR DEPENDENTES
    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                department_id: initialData.department_id || '',
                responsible_id: initialData.responsible_id || '',
                responsible2_id: initialData.responsible2_id || '',
                responsible3_id: initialData.responsible3_id || '',
                observations: initialData.observations || '',
                billing: initialData.billing || 'Não Realizar',
                prevision: initialData.prevision || 0,
                type: 'Projeto'
            });

            // Carregar a lista de dependentes dessa tarefa
            fetchDependents(initialData.id);

        } else {
            setFormData({ 
                name: '', department_id: '', responsible_id: '', responsible2_id: '', 
                responsible3_id: '', observations: '', billing: 'Não Realizar', prevision: 0, type: 'Projeto'
            });
            setDependents([]);
        }
        
        // Limpa o form de novo dependente
        setNewDep({ dependent_id: '', wait: false, observation: '' });

    }, [initialData, isOpen]);

    // --- FUNÇÕES DE DEPENDENTES ---

    const fetchDependents = async (taskId: string) => {
        try {
            const apiClient = setupAPIClient();
            // Rota: router.get('/integracao-tasksModel-dependent', ...)
            const response = await apiClient.get('/integracao-tasksModel-dependent', {
                params: { task_id: taskId }
            });
            setDependents(response.data);
        } catch (error) {
            console.error("Erro ao buscar dependentes:", error);
        }
    };

    const handleAddDependent = async () => {
        if (!initialData?.id) {
            toast.warn("Salve a tarefa antes de adicionar dependentes.");
            return;
        }
        if (!newDep.dependent_id) {
            toast.warn("Selecione uma tarefa dependente.");
            return;
        }

        setLoadingDependents(true);
        try {
            const apiClient = setupAPIClient();
            // Rota: router.post('/integracao-tasksModel-dependent', ...)
            await apiClient.post('/integracao-tasksModel-dependent', {
                task_id: initialData.id,
                dependent_id: newDep.dependent_id,
                wait: newDep.wait,
                observation: newDep.observation
            });

            toast.success("Dependente adicionado!");
            setNewDep({ dependent_id: '', wait: false, observation: '' }); // Limpa inputs
            fetchDependents(initialData.id); // Recarrega lista

        } catch (error: any) {
            const msg = error.response?.data?.error || "Erro ao adicionar dependente.";
            toast.error(msg);
        } finally {
            setLoadingDependents(false);
        }
    };

    const handleDeleteDependent = async (relationId: string) => {
        if (!confirm("Remover este dependente?")) return;

        try {
            const apiClient = setupAPIClient();
            // Rota: router.delete('/integracao-taskModel-dependent', ...)
            // O backend espera { task_id: string } no body, onde task_id é o ID DO VÍNCULO (relationId)
            await apiClient.delete('/integracao-taskModel-dependent', {
                data: { task_id: relationId } 
            });

            toast.success("Removido com sucesso!");
            if (initialData?.id) fetchDependents(initialData.id);

        } catch (error) {
            toast.error("Erro ao remover dependente.");
        }
    };

    // --- FUNÇÕES GERAIS ---

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!formData.name || !formData.department_id || !formData.responsible_id) {
            toast.warning("Preencha os campos obrigatórios.");
            return;
        }
        
        setSaving(true);
        const success = await onSave({ ...formData, id: initialData?.id });
        setSaving(false);
        
        if (success) onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl">
            <ModalOverlay />
            <ModalContent bg="bodyBg" color="bodyText" maxW="800px">
                <ModalHeader>{isEditing ? 'Editar Modelo' : 'Novo Modelo de Tarefa'}</ModalHeader>
                <ModalBody>
                    
                    {/* --- DADOS DA TAREFA --- */}
                    <Flex direction="column" gap={4}>
                        <FormControl isRequired>
                            <FormLabel>Nome da Tarefa</FormLabel>
                            <Input 
                                value={formData.name} 
                                onChange={e => handleInputChange('name', e.target.value)} 
                                borderColor="mainOpacity" 
                            />
                        </FormControl>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>Departamento</FormLabel>
                                <Select 
                                    value={formData.department_id} 
                                    onChange={e => handleInputChange('department_id', e.target.value)} 
                                    borderColor="mainOpacity"
                                    placeholder="Selecione..."
                                >
                                    {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                                </Select>
                            </FormControl>

                            <FormControl>
                                <FormLabel>Tipo de Tarefa</FormLabel>
                                <Select 
                                    value={formData.type} 
                                    onChange={e => handleInputChange('type', e.target.value)} 
                                    borderColor="mainOpacity"
                                >
                                    <option value="Projeto">Projeto</option>
                                    <option value="Distrato">Distrato</option>
                                </Select>
                            </FormControl>
                        </SimpleGrid>

                        <SimpleGrid columns={2} spacing={4}>
                            <FormControl>
                                <FormLabel>Previsão (dias)</FormLabel>
                                <Input 
                                    type="number" 
                                    value={formData.prevision} 
                                    onChange={e => handleInputChange('prevision', Number(e.target.value))} 
                                    borderColor="mainOpacity" 
                                />
                            </FormControl>

                            <FormControl>
                                <FormLabel>Cobrança</FormLabel>
                                <Select 
                                    value={formData.billing} 
                                    onChange={e => handleInputChange('billing', e.target.value)} 
                                    borderColor="mainOpacity"
                                >
                                    <option value="Realizar">Sim</option>
                                    <option value="Não Realizar">Não</option>
                                </Select>
                            </FormControl>
                        </SimpleGrid>

                        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>Responsável 1</FormLabel>
                                <Select 
                                    value={formData.responsible_id} 
                                    onChange={e => handleInputChange('responsible_id', e.target.value)} 
                                    borderColor="mainOpacity" placeholder="Selecione..."
                                >
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </Select>
                            </FormControl>
                            <FormControl>
                                <FormLabel>Responsável 2</FormLabel>
                                <Select 
                                    value={formData.responsible2_id} 
                                    onChange={e => handleInputChange('responsible2_id', e.target.value)} 
                                    borderColor="mainOpacity" placeholder="Opcional"
                                >
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </Select>
                            </FormControl>
                            <FormControl>
                                <FormLabel>Responsável 3</FormLabel>
                                <Select 
                                    value={formData.responsible3_id} 
                                    onChange={e => handleInputChange('responsible3_id', e.target.value)} 
                                    borderColor="mainOpacity" placeholder="Opcional"
                                >
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </Select>
                            </FormControl>
                        </SimpleGrid>

                        <FormControl>
                            <FormLabel>Observações</FormLabel>
                            <Textarea 
                                value={formData.observations} 
                                onChange={e => handleInputChange('observations', e.target.value)} 
                                borderColor="mainOpacity" 
                            />
                        </FormControl>
                    </Flex>

                    {/* --- ÁREA DE DEPENDENTES (Só aparece na edição) --- */}
                    {isEditing && (
                        <Box mt={8} pt={4} borderTop="1px solid" borderColor="mainOpacity">
                            <Heading size="sm" mb={4} color="primaryText">Tarefas Dependentes</Heading>
                            <Text fontSize="xs" mb={4} color="gray.500">
                                Ao criar uma tarefa deste modelo, as tarefas listadas abaixo também serão criadas.
                            </Text>

                            {/* Formulário de Adição de Dependente */}
                            <Flex gap={2} alignItems="flex-end" mb={4} direction={{ base: 'column', md: 'row' }}>
                                <FormControl>
                                    <FormLabel fontSize="sm">Tarefa Dependente</FormLabel>
                                    <Select 
                                        size="sm"
                                        value={newDep.dependent_id} 
                                        onChange={e => setNewDep({...newDep, dependent_id: e.target.value})}
                                        borderColor="mainOpacity"
                                        placeholder="Selecione a tarefa..."
                                    >
                                        {allTasks
                                            .filter(t => t.id !== initialData?.id) // Não pode depender de si mesma
                                            .map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </Select>
                                </FormControl>

                                <FormControl maxW="150px">
                                    <FormLabel fontSize="sm">Observação</FormLabel>
                                    <Input 
                                        size="sm"
                                        value={newDep.observation}
                                        onChange={e => setNewDep({...newDep, observation: e.target.value})}
                                        borderColor="mainOpacity"
                                    />
                                </FormControl>

                                <FormControl display="flex" alignItems="center" mb={1} maxW="100px">
                                    <Checkbox 
                                        isChecked={newDep.wait}
                                        onChange={e => setNewDep({...newDep, wait: e.target.checked})}
                                        colorScheme="green"
                                        size="sm"
                                        mr={2}
                                    />
                                    <FormLabel mb="0" fontSize="sm">Esperar?</FormLabel>
                                </FormControl>

                                <Button 
                                    size="sm" 
                                    colorScheme="blue" 
                                    leftIcon={<IoAdd />} 
                                    onClick={handleAddDependent}
                                    isLoading={loadingDependents}
                                >
                                    Add
                                </Button>
                            </Flex>

                            {/* Lista de Dependentes */}
                            <Box overflowX="auto" border="1px solid" borderColor="mainOpacity" borderRadius="md">
                                <Table variant="simple" size="sm">
                                    <Thead bg="componentColorDarkOnly">
                                        <Tr>
                                            <Th color="primaryText">Tarefa</Th>
                                            <Th color="primaryText">Espera?</Th>
                                            <Th color="primaryText">Obs</Th>
                                            <Th width="50px"></Th>
                                        </Tr>
                                    </Thead>
                                    <Tbody>
                                        {dependents.length === 0 ? (
                                            <Tr>
                                                <Td colSpan={4} textAlign="center" py={4} color="gray.500">
                                                    Nenhum dependente cadastrado.
                                                </Td>
                                            </Tr>
                                        ) : (
                                            dependents.map(dep => (
                                                <Tr key={dep.id}>
                                                    <Td>{dep.dependent?.name || 'Tarefa removida'}</Td>
                                                    <Td>{dep.wait ? 'Sim' : 'Não'}</Td>
                                                    <Td>{dep.observation}</Td>
                                                    <Td>
                                                        <IconButton 
                                                            aria-label="Remover" 
                                                            icon={<IoTrash />} 
                                                            size="xs" 
                                                            colorScheme="red" 
                                                            variant="ghost"
                                                            onClick={() => handleDeleteDependent(dep.id)}
                                                        />
                                                    </Td>
                                                </Tr>
                                            ))
                                        )}
                                    </Tbody>
                                </Table>
                            </Box>
                        </Box>
                    )}

                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" mr={3} onClick={onClose} isDisabled={saving}>
                        Cancelar
                    </Button>
                    <Button 
                        bg="integracao.main" 
                        color="white" 
                        _hover={{ bg: 'integracao.sub' }} 
                        isLoading={saving || loadingData} 
                        onClick={handleSave}
                    >
                        Salvar
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}