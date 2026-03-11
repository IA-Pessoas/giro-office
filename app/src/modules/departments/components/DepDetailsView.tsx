// src/components/departments/DepDetailsView.tsx
import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { DepartmentProfile } from './DepartmentProfile'; // Importe o novo componente

interface DetailsViewProps {
  depId: string | null;
}

export function DepDetailsView({ depId }: DetailsViewProps) {
  if (!depId) {
    return (
      <Box w="100%" h="90vh" display="flex" alignItems="center" justifyContent="center">
        <Text color="main.main" fontSize="lg">Selecione um departamento na lista para ver os detalhes.</Text>
      </Box>
    );
  }

  return (
    <Box 
      w="100%" 
      h="90vh" 
      ml={2}
      position="relative"
      borderRadius={'8px'}
      border={'1px solid'}
      borderColor={'borderColorDarkOnly'}
      shadow={'md'}
      overflowY="auto"
      bg="bodyBg"
    >
      {/* Renderização nativa */}
      <DepartmentProfile key={depId} depId={depId} />
    </Box>
  );
}