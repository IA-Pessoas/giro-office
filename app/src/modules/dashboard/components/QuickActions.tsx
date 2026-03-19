import React from 'react';
import { Flex, Button, Icon, Text, useColorModeValue, Box } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/router';
import {
  FiUsers,
  FiUser,
  FiBriefcase,
  FiLayers,
  FiPlus,
} from 'react-icons/fi';
import type { IconType } from 'react-icons';

interface QuickAction {
  label: string;
  icon: IconType;
  href: string;
  color?: string;
}

const MotionBox = motion(Box);

export function QuickActions() {
  const router = useRouter();
  const bgColor = useColorModeValue('white', 'componentBg');
  const borderColor = useColorModeValue('gray.200', 'borderColor');
  const textColor = useColorModeValue('bodyText', 'bodyText');
  const hoverBg = useColorModeValue('gray.50', 'mainOpacity');
  const primaryColor = useColorModeValue('#2f406a', '#d0ab70');

  const actions: QuickAction[] = [
    {
      label: 'Criar Cliente',
      icon: FiPlus,
      href: '/clients',
      color: primaryColor,
    },
    {
      label: 'Ver Clientes',
      icon: FiUsers,
      href: '/clients',
    },
    {
      label: 'Ver Usuários',
      icon: FiUser,
      href: '/users',
    },
    {
      label: 'Organizações',
      icon: FiBriefcase,
      href: '/organizations',
    },
    {
      label: 'Departamentos',
      icon: FiLayers,
      href: '/departments',
    },
  ];

  return (
    <Box
      bg={bgColor}
      p={4}
      borderRadius="md"
      boxShadow="md"
      borderLeft="4px solid"
      borderColor={primaryColor}
      mb={6}
    >
      <Text
        fontSize="sm"
        fontWeight="bold"
        color="gray.500"
        mb={4}
        textTransform="uppercase"
        letterSpacing="wide"
      >
        Ações Rápidas
      </Text>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap={3}
        wrap="wrap"
      >
        {actions.map((action, index) => (
          <MotionBox
            key={action.href + index}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            flex={{ base: '1', sm: '0 1 auto' }}
            minW={{ base: 'full', sm: 'auto' }}
          >
            <Button
              leftIcon={<Icon as={action.icon} boxSize={5} />}
              variant="outline"
              color={action.color || textColor}
              borderColor={borderColor}
              bg={bgColor}
              size={{ base: 'md', sm: 'sm' }}
              w="100%"
              onClick={() => router.push(action.href)}
              _hover={{
                bg: hoverBg,
                borderColor: action.color || primaryColor,
                color: action.color || primaryColor,
                boxShadow: 'md',
              }}
            >
              {action.label}
            </Button>
          </MotionBox>
        ))}
      </Flex>
    </Box>
  );
}
