import React from 'react';
import { Box, Flex, Card, CardBody, Text } from '@chakra-ui/react';
import type { OrganizationItem } from '../types';

interface OrganizationListProps {
  organizations: OrganizationItem[];
  onOrganizationSelect: (orgId: string) => void;
}

export function OrganizationList({ organizations, onOrganizationSelect }: OrganizationListProps) {
  return (
    <Box
      w="100%"
      overflowX={{ base: 'auto', md: 'hidden' }}
      overflowY={{ base: 'hidden', md: 'auto' }}
      h={{ base: '170px', md: '100%' }}
      p={2}
      bg={'componentColorDarkOnly'}
      sx={{
        '&::-webkit-scrollbar': { width: {md: '4px'}, height: {base: '6px'} },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { background: 'main.main', borderRadius: '24px' },
      }}
    >
      <Flex
        direction={{ base: 'row', md: 'column' }}
        w="100%"
        pb={2}
      >
        {organizations.length > 0 ? (
          organizations.map((org) => (
            <Card 
              key={org.id}
              w={{ base: '200px', md: '100%' }}
              minW={{ base: '200px', md: 'auto' }}
              mr={{ base: 3, md: 0 }}
              mb={{ base: 0, md: 2 }}
              bg={'bodyBg'}
              borderLeft={`5px solid ${org.status === 'active' ? '#10B981' : org.status === 'trial' ? '#F59E0B' : '#EF4444'}`}
              onClick={() => onOrganizationSelect(org.id)}
              cursor="pointer"
              _hover={{ opacity: 0.9, transform: 'scale(1.01)' }}
              transition="transform 0.2s"
            >
              <CardBody>
                <Text fontSize="md" fontWeight="bold" noOfLines={2}>{org.name}</Text>
                <Text fontSize="sm" color='gray.500'>{org.slug}</Text>
                <Text fontSize="xs" color='gray.400' mt={1}>
                  {org.status} • {org.subscription_plan}
                </Text>
              </CardBody>
            </Card>
          ))
        ) : (
          <Text color="gray.500" textAlign="center" w="100%" mt={4}>
            Nenhuma organização encontrada.
          </Text>
        )}
      </Flex>
    </Box>
  );
}
