import React from 'react';
import { Box, Text, useColorModeValue } from '@chakra-ui/react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import type { DashboardStats } from '../types';

interface ServiceDistributionChartProps {
  data: DashboardStats['clientsByService'];
}

export function ServiceDistributionChart({ data }: ServiceDistributionChartProps) {
  const textColor = useColorModeValue('bodyText', 'bodyText');
  const gridColor = useColorModeValue('#e2e8f0', '#2d3748');
  const barColor = useColorModeValue('#2f406a', '#d0ab70');
  const lineColor = useColorModeValue('#d0ab70', '#2f406a');

  const chartData = [
    {
      name: 'Contábil',
      value: data.contabil,
      percentage: ((data.contabil / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Fiscal',
      value: data.fiscal,
      percentage: ((data.fiscal / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Pessoal',
      value: data.pessoal,
      percentage: ((data.pessoal / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Infoproduto',
      value: data.infoproduto,
      percentage: ((data.infoproduto / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Consultoria',
      value: data.consultoria,
      percentage: ((data.consultoria / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Castelo Med',
      value: data.castelo_med,
      percentage: ((data.castelo_med / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
  ];

  const total = Object.values(data).reduce((a, b) => a + b, 0);

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
            {payload[0].payload.name}
          </Text>
          <Text fontSize="sm" color={textColor}>
            Clientes: {payload[0].value}
          </Text>
          <Text fontSize="sm" color={textColor}>
            Percentual: {payload[0].payload.percentage}%
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
        Distribuição por Serviços
      </Text>
      <Text fontSize="sm" color="gray.500" mb={4}>
        Total: {total} clientes
      </Text>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis 
            dataKey="name" 
            tick={{ fill: textColor, fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis tick={{ fill: textColor, fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: textColor }}
            iconType="circle"
          />
          <Bar 
            dataKey="value" 
            fill={barColor}
            name="Clientes"
            radius={[8, 8, 0, 0]}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={lineColor}
            strokeWidth={2}
            dot={{ fill: lineColor, r: 4 }}
            name="Tendência"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
}
