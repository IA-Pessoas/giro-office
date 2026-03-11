import React, { useState, useMemo, useRef } from 'react';
import Head from 'next/head';
import { 
    Box, 
    Button, 
    Flex, 
    Heading, 
    Table, 
    Thead, 
    Tbody, 
    Tr, 
    Th, 
    Td, 
    IconButton, 
    Text, 
    Spinner,
    Input,
    InputGroup,
    InputLeftElement,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
} from '@chakra-ui/react';
import { IoAdd, IoPencil, IoTrash, IoSearch } from 'react-icons/io5';
import { canSSRAuth } from '@modules/auth';
import { useTaskModels, TaskModelModal, type TaskModel } from '@modules/integracao';

export default function TaskModelsConfig() {
    const { models, isLoading, createModel, updateModel, deleteModel } = useTaskModels();
    
    // Estados do Modal de Criação/Edição
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedModel, setSelectedModel] = useState<TaskModel | null>(null);

    // Estados da Busca
    const [searchTerm, setSearchTerm] = useState('');

    // Estados do Modal de Exclusão
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const [modelToDelete, setModelToDelete] = useState<string | null>(null);
    const cancelRef = useRef<HTMLButtonElement>(null); // Ref para foco no botão Cancelar

    // --- Lógica de Criação/Edição ---
    const handleOpenCreate = () => {
        setSelectedModel(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (model: TaskModel) => {
        setSelectedModel(model);
        setIsModalOpen(true);
    };

    const handleSave = async (data: any) => {
        if (selectedModel) {
            return await updateModel(data);
        } else {
            return await createModel(data);
        }
    };

    // --- Lógica de Exclusão (Novo Modal) ---
    const handleOpenDelete = (id: string) => {
        setModelToDelete(id);
        setIsDeleteAlertOpen(true);
    };

    const onCloseDelete = () => {
        setIsDeleteAlertOpen(false);
        setModelToDelete(null);
    };

    const confirmDelete = async () => {
        if (modelToDelete) {
            await deleteModel(modelToDelete);
            onCloseDelete();
        }
    };

    // --- Lógica de Filtragem ---
    const filteredModels = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return models.filter((model) => {
            // Verifica o Nome
            const matchName = model.name.toLowerCase().includes(lowerSearch);
            
            // Verifica o Tipo (Lógica visual que você usou na tabela)
            const typeLabel = model.billing === 'Realizar' ? 'Produto' : 'Tarefa';
            const matchType = typeLabel.toLowerCase().includes(lowerSearch);

            // Verifica o Departamento (opcional, se quiser buscar por depto tbm)
            const matchDept = model.department?.name?.toLowerCase().includes(lowerSearch);

            return matchName || matchType || matchDept;
        });
    }, [models, searchTerm]);

    return (
        <>
            <Head><title>Modelos de Tarefa - Integração</title></Head>
            <Box p={6}>
                <Flex direction={{ base: 'column', md: 'row' }} justify="space-between" align={{ base: 'start', md: 'center' }} mb={6} gap={4}>
                    <Heading size="lg" color="primaryText">Modelos de Tarefas</Heading>
                    
                    <Flex gap={4} w={{ base: '100%', md: 'auto' }}>
                        {/* Barra de Busca */}
                        <InputGroup maxW="300px">
                            <InputLeftElement pointerEvents="none">
                                <IoSearch color="gray.300" />
                            </InputLeftElement>
                            <Input 
                                type="text" 
                                placeholder="Buscar por nome ou tipo..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                bg="componentColorDarkOnly"
                                border="none"
                                _focus={{ border: '1px solid', borderColor: 'integracao.main' }}
                            />
                        </InputGroup>

                        <Button leftIcon={<IoAdd />} bg="integracao.main" color="white" _hover={{ bg: 'integracao.sub' }} onClick={handleOpenCreate}>
                            Nova Tarefa
                        </Button>
                    </Flex>
                </Flex>

                <Box overflowX="auto" bg="componentColorDarkOnly" borderRadius="md" p={4} boxShadow="md">
                    {isLoading ? (
                        <Flex justify="center" p={10}><Spinner color="integracao.main" /></Flex>
                    ) : filteredModels.length === 0 ? (
                        <Text textAlign="center" color="gray.500">
                            {searchTerm ? 'Nenhum resultado encontrado para a busca.' : 'Nenhum modelo cadastrado.'}
                        </Text>
                    ) : (
                        <Table variant="simple">
                            <Thead>
                                <Tr>
                                    <Th color="primaryText">Nome</Th>
                                    <Th color="primaryText">Departamento</Th>
                                    <Th color="primaryText">Tipo</Th>
                                    <Th color="primaryText" width="100px">Ações</Th>
                                </Tr>
                            </Thead>
                            <Tbody>
                                {filteredModels.map((model) => (
                                    <Tr key={model.id} _hover={{ bg: 'mainOpacity' }}>
                                        <Td>{model.name}</Td>
                                        <Td>{model.department?.name || '-'}</Td>
                                        <Td>
                                            <Text 
                                                as="span" 
                                                px={2} py={1} 
                                                borderRadius="md" 
                                                fontSize="sm"
                                                bg={model.billing === 'Realizar' ? 'blue.100' : 'gray.100'}
                                                color={model.billing === 'Realizar' ? 'blue.800' : 'gray.800'}
                                            >
                                                {model.billing === 'Realizar' ? 'Produto' : 'Tarefa'}
                                            </Text>
                                        </Td>
                                        <Td>
                                            <Flex gap={2}>
                                                <IconButton 
                                                    aria-label="Editar" 
                                                    icon={<IoPencil />} 
                                                    size="sm" 
                                                    colorScheme="blue" 
                                                    variant="ghost"
                                                    onClick={() => handleOpenEdit(model)} 
                                                />
                                                <IconButton 
                                                    aria-label="Excluir" 
                                                    icon={<IoTrash />} 
                                                    size="sm" 
                                                    colorScheme="red" 
                                                    variant="ghost"
                                                    onClick={() => handleOpenDelete(model.id)} 
                                                />
                                            </Flex>
                                        </Td>
                                    </Tr>
                                ))}
                            </Tbody>
                        </Table>
                    )}
                </Box>
            </Box>

            {/* Modal de Criação/Edição */}
            <TaskModelModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                initialData={selectedModel} 
                onSave={handleSave} 
            />

            {/* Modal de Confirmação de Exclusão (AlertDialog) */}
            <AlertDialog
                isOpen={isDeleteAlertOpen}
                leastDestructiveRef={cancelRef}
                onClose={onCloseDelete}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent bg="bodyBg" color="bodyText">
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            Excluir Modelo
                        </AlertDialogHeader>

                        <AlertDialogBody>
                            Tem certeza que deseja excluir este modelo de tarefa? Essa ação não pode ser desfeita.
                        </AlertDialogBody>

                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={onCloseDelete} variant="ghost">
                                Cancelar
                            </Button>
                            <Button colorScheme="red" onClick={confirmDelete} ml={3}>
                                Excluir
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </>
    );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    return { props: {} };
});