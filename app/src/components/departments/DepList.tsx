import React from 'react';
import { Box, Flex, Card, CardBody, Text } from '@chakra-ui/react';

import { DepItem } from '../../pages/departments';

interface ListProps {
  deps: DepItem[];
  onDepSelect: (depId: string) => void;
}

export function DepList({ deps, onDepSelect }: ListProps) {
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
        {deps.length > 0 ? (
          deps.map((dep) => (
            <Card 
              key={dep.id}
              w={{ base: '200px', md: '100%' }}
              minW={{ base: '200px', md: 'auto' }}
              mr={{ base: 3, md: 0 }}
              mb={{ base: 0, md: 2 }}
              bg={'bodyBg'}
              borderLeft={`5px solid ${dep.color || '#ccc'}`}
              onClick={() => onDepSelect(dep.id)}
              cursor="pointer"
              _hover={{ opacity: 0.9, transform: 'scale(1.01)' }}
              transition="transform 0.2s"
            >
              <CardBody>
                <Text fontSize="md" fontWeight="bold" noOfLines={2}>{dep.name}</Text>
                <Text fontSize="sm" color='gray.500'>{dep.color}</Text>
              </CardBody>
            </Card>
          ))
        ) : (
          <Text color="gray.500" textAlign="center" w="100%" mt={4}>
            Nenhum departamento encontrado.
          </Text>
        )}
      </Flex>
    </Box>
  );
}