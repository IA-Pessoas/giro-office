import React, { useState } from 'react';
import { Modal, FormControl, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton, Button, Flex, FormLabel, Input, Select } from '@chakra-ui/react';
import { toast } from 'react-toastify';

import { setupAPIClient } from '../../services/api';
import { DepItem } from '../../pages/departments';

interface CreateDepModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newDep: DepItem) => void;
}

export function CreateDepModal({ isOpen, onClose, onCreated }: CreateDepModalProps) {
  const [formData, setFormData] = useState({ name: '', color: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { value } = e.target;
    setFormData(prev => ({ ...prev, [e.target.name]: value }));
  };

  const handleCadastrar = async () => {
    if (!formData.name) {
      toast.warn('Preencha todos os campos obrigatórios!');
      return;
    }
    setIsLoading(true);
    try {
      const apiClient = setupAPIClient();
      const response = await apiClient.post('/departments', formData);
      toast.success("Departamento cadastrado com sucesso!");
      onCreated(response.data.dep);
      onClose();
      setFormData({ name: '', color: '' });
    } catch (err) {
      toast.error('Erro ao cadastrar departamento.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader color='primaryText'>Cadastrar Novo Departamento</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex direction="column" gap={4}>
            <FormControl isRequired><FormLabel>Nome</FormLabel><Input name="name" value={formData.name} onChange={handleInputChange} color={'bodyText'} /></FormControl>
            <FormControl isRequired><FormLabel>Cor</FormLabel><Input name="color" type="color" value={formData.color} onChange={handleInputChange} color={'bodyText'} /></FormControl>
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