import React from 'react';
import { Box, Grid, Text, useColorModeValue, Alert, AlertIcon, AlertTitle, AlertDescription } from '@chakra-ui/react';
import type { DashboardStats, DashboardInsight } from '../types';

interface InsightsPanelProps {
  insights: DashboardStats['insights'];
}

function schemeFromType(type: DashboardInsight['type']) {
  if (type === 'warning') return { status: 'warning' as const };
  if (type === 'success') return { status: 'success' as const };
  return { status: 'info' as const };
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const textColor = useColorModeValue('bodyText', 'bodyText');

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
        Insights e Alertas
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr' }} gap={3}>
        {insights.map((insight, idx) => (
          <Alert
            key={`${insight.title}-${idx}`}
            {...schemeFromType(insight.type)}
            variant={useColorModeValue('subtle', 'left-accent')}
            borderRadius="md"
          >
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">{insight.title}</AlertTitle>
              <AlertDescription fontSize="sm">{insight.description}</AlertDescription>
            </Box>
          </Alert>
        ))}
      </Grid>
    </Box>
  );
}

