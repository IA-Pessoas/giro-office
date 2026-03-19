import React from 'react';
import { Box, Text, Flex, useColorModeValue } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import type { StatCardData } from '../types';

interface StatCardProps {
  data: StatCardData;
  delay?: number;
}

const MotionBox = motion(Box);

export function StatCard({ data, delay = 0 }: StatCardProps) {
  const { title, value, icon: Icon, change, changeLabel, color } = data;
  
  const bgColor = useColorModeValue('white', 'componentBg');
  const borderColor = useColorModeValue('gray.200', 'borderColor');
  const textColor = useColorModeValue('bodyText', 'bodyText');
  const changeColor = change && change >= 0 
    ? useColorModeValue('green.500', 'green.400')
    : useColorModeValue('red.500', 'red.400');

  const cardColor = color || useColorModeValue('main.main', 'main.mainDourado');

  return (
    <MotionBox
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ 
        scale: 1.02,
        boxShadow: 'lg',
      }}
      bg={bgColor}
      borderLeft={`4px solid ${cardColor}`}
      borderRadius="md"
      p={6}
      boxShadow="md"
      cursor="pointer"
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        bg: cardColor,
        opacity: 0.3,
      }}
    >
      <Flex justify="space-between" align="flex-start" mb={4}>
        <Box>
          <Text fontSize="sm" color="gray.500" mb={1} fontWeight="medium">
            {title}
          </Text>
          <Text fontSize="3xl" fontWeight="bold" color={textColor}>
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
          </Text>
          {change !== undefined && (
            <Flex align="center" mt={2}>
              <Text fontSize="sm" color={changeColor} fontWeight="medium">
                {change >= 0 ? '+' : ''}{change}%
              </Text>
              {changeLabel && (
                <Text fontSize="xs" color="gray.500" ml={2}>
                  {changeLabel}
                </Text>
              )}
            </Flex>
          )}
        </Box>
        <Box
          p={3}
          borderRadius="full"
          bg={`${cardColor}15`}
          color={cardColor}
        >
          <Icon size={24} />
        </Box>
      </Flex>
    </MotionBox>
  );
}
