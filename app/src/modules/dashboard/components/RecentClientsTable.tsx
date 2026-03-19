import React from 'react';
import Link from 'next/link';
import {
  Box,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  useColorModeValue,
} from '@chakra-ui/react';
import type { DashboardStats, RecentClientRow } from '../types';

interface RecentClientsTableProps {
  data: DashboardStats['recentClients'];
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function statusColor(status: string) {
  const s = status.toLowerCase();
  if (s === 'active' || s === 'ativo') return 'green';
  if (s === 'trial') return 'yellow';
  if (s === 'inactive' || s === 'inativo') return 'red';
  return 'gray';
}

export function RecentClientsTable({ data }: RecentClientsTableProps) {
  const textColor = useColorModeValue('bodyText', 'bodyText');

  return (
    <Box
      bg={useColorModeValue('white', 'componentBg')}
      p={6}
      borderRadius="md"
      boxShadow="md"
      borderLeft="4px solid"
      borderColor={useColorModeValue('main.main', 'main.mainDourado')}
      overflowX="auto"
    >
      <Text fontSize="lg" fontWeight="bold" mb={4} color={textColor}>
        Últimos Clientes
      </Text>

      <Table size="sm">
        <Thead>
          <Tr>
            <Th>Nome</Th>
            <Th>Status</Th>
            <Th>Cidade/UF</Th>
            <Th>Entrada</Th>
          </Tr>
        </Thead>
        <Tbody>
          {data.map((row) => (
            <Tr key={row.id} _hover={{ bg: useColorModeValue('gray.50', 'mainOpacity') }}>
              <Td fontWeight="medium">
                <Link href={`/clients/${row.id}`}>
                  <Text as="span" color={useColorModeValue('main.main', 'main.mainDourado')} _hover={{ textDecoration: 'underline' }}>
                    {row.name}
                  </Text>
                </Link>
              </Td>
              <Td>
                <Badge colorScheme={statusColor(row.status)} variant="subtle">
                  {row.status}
                </Badge>
              </Td>
              <Td>{row.city}/{row.state}</Td>
              <Td>{formatDate(row.entryDate)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
}

