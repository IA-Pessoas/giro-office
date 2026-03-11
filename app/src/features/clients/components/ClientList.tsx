import React from 'react';
import { Box, Flex, Grid, Card, CardBody, Text, useBreakpointValue } from '@chakra-ui/react';

import { ClientItem } from '../../pages/clients';
import { formatCPF_CNPJ } from '@shared/utils/formatters';

interface ListProps {
  clients: ClientItem[];
  onSelect: (clientId: string) => void;
}

export function ClientList({ clients, onSelect }: ListProps) {
  const isDesktop = useBreakpointValue({ base: false, md: true });

  // Prevent flash of content mismatch during SSR
  if (isDesktop === undefined) {
    return null;
  }

  return (
    <Box
      w="100%"
      overflowY="auto"
      h={{ base: 'calc(100vh - 220px)', md: '100%' }}
      p={isDesktop ? 0 : 2}
      bg={'componentColorDarkOnly'}
      sx={{
        '&::-webkit-scrollbar': { width: '4px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { background: 'main.main', borderRadius: '24px' },
      }}
    >
      {isDesktop && (
        <Grid
          templateColumns="1fr 4fr 3fr 2fr"
          gap={4}
          w="100%"
          px={4}
          py={2}
          borderBottom="2px solid"
          borderColor="borderColor"
          position="sticky"
          top={0}
          bg="componentColorDarkOnly"
        >
          <Text fontWeight="bold" color="primaryText">Código</Text>
          <Text fontWeight="bold" color="primaryText">Razão Social</Text>
          <Text fontWeight="bold" color="primaryText">Nome Fantasia</Text>
          <Text fontWeight="bold" color="primaryText">CPF / CNPJ</Text>
        </Grid>
      )}

      {clients.length > 0 ? (
        <Box p={isDesktop ? 2 : 0}>
          {clients.map((client) => (
            isDesktop ? (
              <Grid
                key={client.id}
                templateColumns='1fr 4fr 3fr 2fr'
                gap={4}
                w={'100%'}
                px={4}
                py={3}
                borderBottom="1px solid"
                borderColor="mainOpacity"
                alignItems="center"
                onClick={() => onSelect(client.id)}
                cursor="pointer"
                _hover={{ bg: 'mainOpacity' }}
                borderRadius="md"
                transition="background 0.2s"
              >
                <Text fontSize="sm" color='gray.500'>{client.dominio_code}</Text>
                <Text fontSize="md" noOfLines={1}>{client.company_name}</Text>
                <Text fontSize="md" noOfLines={1}>{client.fantasy_name}</Text>
                <Text fontSize="sm" color='gray.500'>{formatCPF_CNPJ(client.cpf_cnpj)}</Text>
              </Grid>
            ) : (
              <Card
                key={client.id}
                w='100%'
                bg={'bodyBg'}
                borderLeft={`4px solid`}
                borderLeftColor={client.status.toLowerCase() === 'ativo' ? 'green.400' : 'yellow.400'}
                onClick={() => onSelect(client.id)}
                cursor="pointer"
                mb={2}
              >
                <CardBody p={3}>
                  <Flex justify="space-between" align="center">
                    <Text fontSize="md" fontWeight="bold" noOfLines={1} maxW="70%">{client.name}</Text>
                    <Text fontSize="xs" color='gray.500'>{client.dominio_code}</Text>
                  </Flex>
                  <Text fontSize="sm" color='gray.500' mt={1}>{formatCPF_CNPJ(client.cpf_cnpj)}</Text>
                </CardBody>
              </Card>
            )
          ))}
        </Box>
      ) : (
        <Text color="gray.500" textAlign="center" w="100%" mt={4}>
          Nenhum cliente encontrado.
        </Text>
      )}
    </Box>
  );
}