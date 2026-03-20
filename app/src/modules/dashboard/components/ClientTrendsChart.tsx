import React from 'react';
import { Box, Text, useColorModeValue } from '@chakra-ui/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import type { DashboardStats } from '../types';

interface ClientTrendsChartProps {
  data: DashboardStats['monthlyTrends'];
}

export function ClientTrendsChart({ data }: ClientTrendsChartProps) {
  const textColor = useColorModeValue('bodyText', 'bodyText');
  const gridColor = useColorModeValue('#e2e8f0', '#2d3748');
  const areaColor = useColorModeValue('#2f406a', '#d0ab70');
  const lineColor = useColorModeValue('#d0ab70', '#2f406a');

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <Box
          bg={useColorModeValue('white', 'gray.800')}
          p={3}
          borderRadius="md"
          boxShadow="lg"
          border="1px solid"
          borderColor={useColorModeValue('gray.200', 'gray.600')}
        >
          <Text fontWeight="bold" mb={2} color={textColor}>
            {payload[0].payload.month}
          </Text>
          <Text fontSize="sm" color={textColor}>
            Novos Clientes: {payload[0].value}
          </Text>
        </Box>
      );
    }
    return null;
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
        Tendência de Novos Clientes
      </Text>
      <Text fontSize="sm" color="gray.500" mb={4}>
        Últimos {data.length} meses
      </Text>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorNewClients" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={areaColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis 
            dataKey="month" 
            tick={{ fill: textColor, fontSize: 12 }}
          />
          <YAxis tick={{ fill: textColor, fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: textColor }}
            iconType="circle"
          />
          <Area
            type="monotone"
            dataKey="newClients"
            stroke={lineColor}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorNewClients)"
            name="Novos Clientes"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}
