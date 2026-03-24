// src/components/Clients/ClientDetails.tsx
import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { ClientProfile } from './ClientProfile'; // Importe o novo componente

interface DetailsViewProps {
  clientId: string | null;
}

export function ClientDetailsView({ clientId }: DetailsViewProps) {
  if (!clientId) {
    return (
      <Box w="100%" h="95vh" display="flex" alignItems="center" justifyContent="center">
        <Text color="main.main" fontSize="lg">Selecione um cliente na lista para ver os detalhes.</Text>
      </Box>
    );
  }

  return (
    <Box 
      w="100%" 
      h="95vh" 
      ml={2}
      position="relative"
      borderRadius={'8px'}
      border={'1px solid'}
      borderColor={'borderColorDarkOnly'}
      shadow={'md'}
      overflowY="auto"
      bg="bodyBg"
    >
      {/* Renderização nativa com Key para forçar remontagem ao trocar de cliente */}
      <ClientProfile key={clientId} clientId={clientId} />
    </Box>
  );
}