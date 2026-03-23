import React, { useState } from 'react';
import { Button } from '@chakra-ui/react';
import { toast } from 'react-toastify';

import { setupAPIClient } from '@shared/services/api';
import { Dialog } from '@shared/components';
import type { DepItem } from '../types';

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Cadastrar Novo Departamento"
      footer={(
        <>
          <Button colorScheme="gray" mr={3} onClick={onClose}>
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
            onClick={handleCadastrar}
          >
            Salvar
          </Button>
        </>
      )}
    >
      <div className="u-stack u-gap-4">
        <div className="u-stack u-gap-2">
          <label htmlFor="dep-name" className="text-sm font-medium text-[var(--colors-blue-500)]">
            Nome
          </label>
          <input
            id="dep-name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className="ui-input"
            required
          />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="dep-color" className="text-sm font-medium text-[var(--colors-blue-500)]">
            Cor
          </label>
          <input
            id="dep-color"
            name="color"
            type="color"
            value={formData.color}
            onChange={handleInputChange}
            className="h-10 w-full rounded-lg border border-black/15 bg-white p-1"
            required
          />
        </div>
      </div>
    </Dialog>
  );
}