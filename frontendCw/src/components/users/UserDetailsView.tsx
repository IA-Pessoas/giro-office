import React from 'react';
import { Box, Text, Flex } from '@chakra-ui/react';
import { UserProfile } from './UserProfile'; // Importe o componente que criamos

interface UserDetailsViewProps {
  userId: string | null;
  me: any;        // Adicionado
  departments: any[]; // Adicionado
}

export function UserDetailsView({ userId, me, departments }: UserDetailsViewProps) {
  
  if (!userId) {
    return (
      <Box w="100%" h="90vh" display="flex" alignItems="center" justifyContent="center">
        <Flex direction="column" align="center">
            <Text color="main.main" fontSize="lg">Selecione um usuário na lista para ver os detalhes.</Text>
        </Flex>
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
      overflowY="auto" // Importante para permitir rolagem no componente nativo
      bg="bodyBg"
    >
      {/* Renderização Nativa em vez de Iframe */}
      <UserProfile 
        key={userId} // A key força o componente a recarregar quando muda o ID
        userId={userId} 
        me={me}
        departments={departments}
      />
    </Box>
  );
}