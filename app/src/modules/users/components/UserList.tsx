import React from 'react';
import { Box, Flex, Card, CardBody, Text } from '@chakra-ui/react';
import type { UserItem } from '../types';

interface UserListProps {
  users: UserItem[];
  onUserSelect: (userId: string) => void;
}

export function UserList({ users, onUserSelect }: UserListProps) {
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
        {users.length > 0 ? (
          users.map((user) => (
            <Card 
              key={user.id}
              w={{ base: '200px', md: '100%' }}
              minW={{ base: '200px', md: 'auto' }}
              mr={{ base: 3, md: 0 }}
              mb={{ base: 0, md: 2 }}
              bg={'bodyBg'}
              borderLeft={`5px solid ${user.department?.color || '#ccc'}`}
              onClick={() => onUserSelect(user.id)}
              cursor="pointer"
              _hover={{ opacity: 0.9, transform: 'scale(1.01)' }}
              transition="transform 0.2s"
            >
              <CardBody>
                <Text fontSize="md" fontWeight="bold" noOfLines={2}>{user.name}</Text>
                <Text fontSize="sm" color='gray.500'>{user.department?.name}</Text>
              </CardBody>
            </Card>
          ))
        ) : (
          <Text color="gray.500" textAlign="center" w="100%" mt={4}>
            Nenhum usuário encontrado.
          </Text>
        )}
      </Flex>
    </Box>
  );
}