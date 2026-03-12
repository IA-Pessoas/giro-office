import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
} from '@chakra-ui/react';
import { useOrganizationForm } from '../hooks/useOrganizationForm';
import type { Organization } from '../types';

interface CreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newOrganization: Organization) => void;
}

export function CreateOrganizationModal({
  isOpen,
  onClose,
  onCreated,
}: CreateOrganizationModalProps) {
  const { formData, isLoading, handleInputChange, handleCreate, resetForm } = useOrganizationForm();

  const handleSubmit = async () => {
    const created = await handleCreate();
    if (created) {
      onCreated(created);
      resetForm();
      onClose();
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader color="primaryText">Cadastrar Nova Organização</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex direction="column" gap={4}>
            <FormControl isRequired>
              <FormLabel>Nome da Organização</FormLabel>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                color="bodyText"
                placeholder="Ex: Castelo Contabilidade"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Slug (identificador único)</FormLabel>
              <Input
                name="slug"
                value={formData.slug}
                onChange={handleInputChange}
                color="bodyText"
                placeholder="Ex: castelo-contabilidade"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>CNPJ</FormLabel>
              <Input
                name="cnpj"
                value={formData.cnpj}
                onChange={handleInputChange}
                color="bodyText"
                placeholder="00000000000000"
                maxLength={18}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Email do Criador</FormLabel>
              <Input
                name="email_created_by"
                type="email"
                value={formData.email_created_by}
                onChange={handleInputChange}
                color="bodyText"
                placeholder="admin@exemplo.com"
              />
            </FormControl>

            <FormControl>
              <FormLabel>URL do Logo (opcional)</FormLabel>
              <Input
                name="logo_url"
                value={formData.logo_url || ''}
                onChange={handleInputChange}
                color="bodyText"
                placeholder="https://exemplo.com/logo.png"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Plano de Assinatura</FormLabel>
              <Input
                name="subscription_plan"
                value={formData.subscription_plan}
                onChange={handleInputChange}
                color="bodyText"
                placeholder="trial"
              />
            </FormControl>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="gray" mr={3} onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            bg="componentColor"
            color="secondaryText"
            border="1px solid transparent"
            _hover={{
              bg: 'white',
              color: 'main.main',
            }}
            isLoading={isLoading}
            onClick={handleSubmit}
          >
            Salvar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
