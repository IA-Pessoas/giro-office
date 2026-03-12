import React, { useEffect, useState } from 'react';
import { Box, Text, Flex, Spinner, Badge } from '@chakra-ui/react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { organizationService } from '../services/organizationService';
import type { Organization } from '../types';

interface OrganizationProfileProps {
  organizationId: string;
}

export function OrganizationProfile({ organizationId }: OrganizationProfileProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrganization = async () => {
      setIsLoading(true);
      try {
        const data = await organizationService.getById(organizationId);
        setOrganization(data);
      } catch (error: any) {
        const errorMessage = error?.response?.data?.error || 'Erro ao buscar organização.';
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    if (organizationId) {
      fetchOrganization();
    }
  }, [organizationId]);

  if (isLoading) {
    return (
      <Flex justify="center" align="center" h="100%" minH="400px">
        <Spinner size="xl" />
      </Flex>
    );
  }

  if (!organization) {
    return (
      <Box p={4}>
        <Text color="red.500">Erro ao carregar organização.</Text>
      </Box>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'green';
      case 'trial': return 'yellow';
      case 'suspended': return 'orange';
      case 'cancelled': return 'red';
      case 'past_due': return 'red';
      default: return 'gray';
    }
  };

  return (
    <Box p={6}>
      <Flex direction="column" gap={4}>
        <Flex justify="space-between" align="center">
          <Text fontSize="2xl" fontWeight="bold" color="primaryText">
            {organization.name}
          </Text>
          <Badge colorScheme={getStatusColor(organization.status)} fontSize="md" p={2}>
            {organization.status}
          </Badge>
        </Flex>

        <Box>
          <Text fontSize="sm" color="gray.500" mb={1}>Slug</Text>
          <Text color="bodyText">{organization.slug}</Text>
        </Box>

        <Box>
          <Text fontSize="sm" color="gray.500" mb={1}>CNPJ</Text>
          <Text color="bodyText">{organization.cnpj}</Text>
        </Box>

        <Box>
          <Text fontSize="sm" color="gray.500" mb={1}>Email do Criador</Text>
          <Text color="bodyText">{organization.email_created_by}</Text>
        </Box>

        <Box>
          <Text fontSize="sm" color="gray.500" mb={1}>Plano de Assinatura</Text>
          <Text color="bodyText">{organization.subscription_plan}</Text>
        </Box>

        {organization.logo_url && (
          <Box>
            <Text fontSize="sm" color="gray.500" mb={1}>Logo</Text>
            <Box mt={2}>
              <img src={organization.logo_url} alt={organization.name} style={{ maxWidth: '200px', maxHeight: '200px' }} />
            </Box>
          </Box>
        )}

        <Box>
          <Text fontSize="sm" color="gray.500" mb={1}>Criado em</Text>
          <Text color="bodyText">
            {new Date(organization.created_at).toLocaleString('pt-BR')}
          </Text>
        </Box>

        <Box>
          <Text fontSize="sm" color="gray.500" mb={1}>Atualizado em</Text>
          <Text color="bodyText">
            {new Date(organization.updated_at).toLocaleString('pt-BR')}
          </Text>
        </Box>
      </Flex>
    </Box>
  );
}
