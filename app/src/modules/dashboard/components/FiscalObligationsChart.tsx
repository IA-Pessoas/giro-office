import React from 'react';
import { Box, Text, useColorModeValue } from '@chakra-ui/react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { DashboardStats, FiscalObligationStatus } from '../types';

interface FiscalObligationsChartProps {
  data: DashboardStats['fiscal']['obligations'];
}

const STATUS_LABEL: Record<FiscalObligationStatus, string> = {
  Pendente: 'Pendentes',
  Emitida: 'Emitidas',
  Atrasada: 'Atrasadas',
};

export function FiscalObligationsChart({ data }: FiscalObligationsChartProps) {
  const textColor = useColorModeValue('bodyText', 'bodyText');
  const gridColor = useColorModeValue('#e2e8f0', '#2d3748');
  const pendingColor = useColorModeValue('#2f406a', '#d0ab70');
  const issuedColor = useColorModeValue('#48BB78', '#48BB78');
  const overdueColor = useColorModeValue('#EF4444', '#F87171');

  const chartData = data.map((item) => ({
    status: STATUS_LABEL[item.status],
    count: item.count,
    statusKey: item.status,
  }));

  const barFill = (status: FiscalObligationStatus) => {
    if (status === 'Pendente') return pendingColor;
    if (status === 'Emitida') return issuedColor;
    return overdueColor;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    return (
      <Box
        bg={useColorModeValue('white', 'gray.800')}
        p={3}
        borderRadius="md"
        boxShadow="lg"
        border="1px solid"
        borderColor={useColorModeValue('gray.200', 'gray.600')}
      >
        <Text fontWeight="bold" color={textColor}>
          {p.payload.status}
        </Text>
        <Text fontSize="sm" color={textColor}>
          Quantidade: {p.value}
        </Text>
      </Box>
    );
  };

  return (
    <Box
      bg={useColorModeValue('white', 'componentBg')}
      p={6}
      borderRadius="md"
      boxShadow="md"
      borderLeft="4px solid"
      borderColor={useColorModeValue('main.main', 'main.mainDourado')}
    >
      <Text fontSize="lg" fontWeight="bold" mb={4} color={textColor}>
        Fiscal: Obrigações/Guias
      </Text>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="status" tick={{ fill: textColor, fontSize: 12 }} />
          <YAxis tick={{ fill: textColor, fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" name="Quantidade" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={barFill(entry.statusKey)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Box mt={3} display="flex" gap={3} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={2}>
          <Box w="10px" h="10px" bg={pendingColor} borderRadius="full" />
          <Text fontSize="xs" color="gray.500">Pendentes</Text>
        </Box>
        <Box display="flex" alignItems="center" gap={2}>
          <Box w="10px" h="10px" bg={issuedColor} borderRadius="full" />
          <Text fontSize="xs" color="gray.500">Emitidas</Text>
        </Box>
        <Box display="flex" alignItems="center" gap={2}>
          <Box w="10px" h="10px" bg={overdueColor} borderRadius="full" />
          <Text fontSize="xs" color="gray.500">Atrasadas</Text>
        </Box>
      </Box>
    </Box>
  );
}
