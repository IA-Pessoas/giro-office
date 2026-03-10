import React, { useState } from 'react';
import { Modal, FormControl, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton, Button, Flex, FormLabel, Input, Select } from '@chakra-ui/react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';
import { DepItem, UserItem } from '../../pages/users';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (newUser: UserItem) => void;
  departments: DepItem[];
}

export function CreateUserModal({ isOpen, onClose, onUserCreated, departments }: CreateUserModalProps) {
  const [formData, setFormData] = useState({ name: '', login: '', password: '', department_id: '', permission: 0 });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'permission' ? parseInt(value) : value }));
  };

  const handleCadastrar = async () => {
    if (!formData.name || !formData.login || !formData.password || !formData.department_id) {
      toast.warn('Preencha todos os campos obrigatórios!');
      return;
    }
    setIsLoading(true);
    try {
      const apiClient = setupAPIClient();
      const response = await apiClient.post('/users', formData);
      toast.success("Usuário cadastrado com sucesso!");
      onUserCreated(response.data.user); // Notifica a página pai com o novo usuário
      onClose(); // Fecha o modal
      setFormData({ name: '', login: '', password: '', department_id: '', permission: 0 }); // Limpa o formulário
    } catch (err) {
      toast.error('Erro ao cadastrar usuário.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader color='primaryText'>Cadastrar Novo Usuário</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex direction="column" gap={4}>
            <FormControl isRequired><FormLabel>Nome</FormLabel><Input name="name" value={formData.name} onChange={handleInputChange} color={'bodyText'} /></FormControl>
            <FormControl isRequired><FormLabel>Login</FormLabel><Input name="login" value={formData.login} onChange={handleInputChange} color={'bodyText'} /></FormControl>
            <FormControl isRequired><FormLabel>Senha</FormLabel><Input type="password" name="password" value={formData.password} onChange={handleInputChange} color={'bodyText'} /></FormControl>
            <FormControl isRequired><FormLabel>Departamento</FormLabel>
                <Select name="department_id" placeholder="Selecione um departamento" value={formData.department_id} onChange={handleInputChange} color={'bodyText'}>
                  {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                </Select>
            </FormControl>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="gray"  mr={3} onClick={onClose}>Cancelar</Button>
          <Button 
            bg="componentColor"
            color={'secondaryText'}
            border={'1px solid transparent'} 
            _hover={{ 
              bg: 'white', 
              color: 'main.main', 
            }} 
            isLoading={isLoading} 
            onClick={handleCadastrar}
          >
            Salvar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}