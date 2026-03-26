import React, { useState, useEffect } from 'react';
import { IoAdd, IoTrash } from "react-icons/io5";
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';
import { integracaoService } from '../services/integracaoService';
import type { TaskModel, TaskDependent } from '../types';

// --- Chakra shims local (para remover dependência de @chakra-ui/react sem reescrever toda a UI) ---
// Observação: estes shims aplicam apenas um subconjunto de estilo via inline; a lógica/estrutura permanece.
type AnyProps = Record<string, any>;

const Modal = ({ isOpen, children }: AnyProps) => {
    if (!isOpen) return null;
    return <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>{children}</div>;
};
const ModalOverlay = () => (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
);
const ModalContent = ({ children, ...rest }: AnyProps) => (
    <div
        style={{
            position: 'relative',
            margin: '5vh auto',
            maxWidth: rest.maxW ?? 800,
            background: '#fff',
            color: '#0f172a',
            borderRadius: 12,
            overflow: 'hidden',
        }}
    >
        {children}
    </div>
);
const ModalHeader = ({ children, ...rest }: AnyProps) => (
    <div style={{ padding: '1rem', fontWeight: 800, borderBottom: '1px solid #e2e8f0' }}>{children}</div>
);
const ModalBody = ({ children, ...rest }: AnyProps) => <div style={{ padding: '1rem' }}>{children}</div>;
const ModalFooter = ({ children, ...rest }: AnyProps) => <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>{children}</div>;

const Box = ({ children, style, ...props }: AnyProps) => (
    <div style={{ ...(style ?? {}), ...(props.style ?? {}) }} {...props}>
        {children}
    </div>
);
const Text = ({ children, style, ...props }: AnyProps) => (
    <p style={{ margin: 0, ...(style ?? {}) }} {...props}>
        {children}
    </p>
);
const Heading = ({ children, style, ...props }: AnyProps) => (
    <h3 style={{ margin: 0, fontWeight: 800, ...(style ?? {}) }} {...props}>
        {children}
    </h3>
);

const Flex = ({ children, style, direction, gap, ...props }: AnyProps) => {
    const flexDirection = direction || props.flexDirection;
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: flexDirection ?? 'row',
                gap: typeof gap === 'number' ? `${gap}px` : gap,
                ...(style ?? {}),
            }}
            {...props}
        >
            {children}
        </div>
    );
};

const SimpleGrid = ({ children, columns, ...props }: AnyProps) => {
    // columns pode ser número ou objeto { base, md }
    const cols =
        typeof columns === 'number'
            ? columns
            : columns?.md ?? columns?.base ?? 2;
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: 12,
            }}
        >
            {children}
        </div>
    );
};

const Divider = () => <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '0.75rem 0' }} />;

const FormControl = ({ children, isRequired, ...props }: AnyProps) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
    </div>
);
const FormLabel = ({ children, ...props }: AnyProps) => (
    <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>{children}</label>
);

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

const IconButton = ({ children, icon, ...props }: AnyProps) => (
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
        {icon ?? children}
    </button>
);

const Checkbox = ({ isChecked, onChange, ...props }: AnyProps) => (
    <input type="checkbox" checked={!!isChecked} onChange={onChange} style={{ cursor: 'pointer' }} />
);

const Table = ({ children, ...props }: AnyProps) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }} {...props}>
        {children}
    </table>
);
const Thead = ({ children, ...props }: AnyProps) => <thead>{children}</thead>;
const Tbody = ({ children, ...props }: AnyProps) => <tbody>{children}</tbody>;
const Tr = ({ children, ...props }: AnyProps) => <tr>{children}</tr>;
const Th = ({ children, ...props }: AnyProps) => (
    <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem', borderBottom: '1px solid #e2e8f0' }}>{children}</th>
);
const Td = ({ children, ...props }: AnyProps) => (
    <td style={{ textAlign: 'left', padding: '0.5rem 0.35rem', borderBottom: '1px solid #f1f5f9' }}>{children}</td>
);

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: TaskModel | null;
    onSave: (data: any) => Promise<boolean>;
}

interface UserOption { id: string; name: string; }
interface DepartmentOption { id: string; name: string; }
interface TaskOption { id: string; name: string; } // Para o select de tarefas

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
            const dependentsData = await integracaoService.taskModels.getDependents(taskId);
            setDependents(dependentsData);
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
            await integracaoService.taskModels.createDependent({
                task_model_id: initialData.id,
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
            await integracaoService.taskModels.deleteDependent(relationId);

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