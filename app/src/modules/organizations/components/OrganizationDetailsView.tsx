import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { OrganizationProfile } from './OrganizationProfile';

interface OrganizationDetailsViewProps {
  organizationId: string | null;
}

export function OrganizationDetailsView({ organizationId }: OrganizationDetailsViewProps) {
  if (!organizationId) {
    return (
      <Box w="100%" h="90vh" display="flex" alignItems="center" justifyContent="center">
        <Text color="main.main" fontSize="lg">
          Selecione uma organização na lista para ver os detalhes.
        </Text>
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
      <OrganizationProfile key={organizationId} organizationId={organizationId} />
    </Box>
  );
}
