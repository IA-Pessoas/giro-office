import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { Box, Flex, useDisclosure, Spinner, Icon } from '@chakra-ui/react';
import { FaBuilding } from 'react-icons/fa';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { canSSRAuth } from '@modules/auth';
import { setupAPIClient } from '@shared/services/api';
import {
  OrganizationFilters,
  OrganizationList,
  OrganizationDetailsView,
  CreateOrganizationModal,
  organizationService,
  type OrganizationItem,
  type Organization,
} from '@modules/organizations';

interface Props {
  organizations: OrganizationItem[];
}

export default function Organizations({ organizations }: Props) {
  const [organizationsList, setOrganizationsList] = useState<OrganizationItem[]>(organizations || []);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [isListLoading, setIsListLoading] = useState(false);

  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();

  const isDesktopListCollapsed = !!selected;

  const filtered = useMemo(() => {
    return organizationsList.filter(org =>
      org.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [organizationsList, searchTerm]);

  const handleOrganizationCreated = (newOrg: Organization) => {
    if (filterStatus === 'active') {
      setOrganizationsList(currentList => [{
        id: newOrg.id,
        name: newOrg.name,
        slug: newOrg.slug,
        status: newOrg.status,
        cnpj: newOrg.cnpj,
        subscription_plan: newOrg.subscription_plan,
      }, ...currentList]);
    } else {
      toast.info(`Organização ${newOrg.name} criada, mude o filtro para 'Ativos' para vê-la.`);
    }
  };

  const handleFilterChange = async (status: string) => {
    setIsListLoading(true);
    try {
      const orgs = await organizationService.list({ status });
      setOrganizationsList(orgs);
      setFilterStatus(status);
      toast.success(`Filtro '${status}' aplicado.`);
    } catch (error) {
      toast.error('Erro ao buscar organizações.');
    } finally {
      setIsListLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Organizações</title>
      </Head>

      <Flex
        direction={{ base: 'column', md: 'row' }}
        w="99%"
        h={{ md: '90vh' }}
        gap={3}
        position="relative"
      >
        <Flex
          direction="column"
          role="group"
          position={{ base: 'relative', md: isDesktopListCollapsed ? 'absolute' : 'relative' }}
          w={{ base: '100%', md: isDesktopListCollapsed ? '80px' : '350px' }}
          minW={{ md: isDesktopListCollapsed ? '80px' : '350px' }}
          h={{ base: 'auto', md: '90vh' }}
          zIndex="20"
          bg="componentColorDarkOnly"
          boxShadow="md"
          borderRadius="md"
          justifyContent={'center'}
          alignItems={'center'}
          transition="all 0.3s ease-in-out"
          _hover={{ w: { md: '350px' }, }}
          overflow="hidden"
        >
          <Flex
            position="absolute"
            w="80px" h="80px"
            align="center" justify="center"
            display={{ base: 'none', md: 'flex' }}
            opacity={isDesktopListCollapsed ? 1 : 0}
            pointerEvents="none"
            _groupHover={{ opacity: 0 }}
            transition="opacity 0.2s"
          >
            <Icon as={FaBuilding} boxSize={7} color="primaryText" />
          </Flex>

          <Flex
            direction="column"
            w={{ base: '100%', md: '350px' }}
            h="100%"
            opacity={isDesktopListCollapsed ? 0 : 1}
            pointerEvents={isDesktopListCollapsed ? 'none' : 'auto'}
            _groupHover={{ opacity: 1, pointerEvents: 'auto' }}
            transition="opacity 0.3s ease-in-out"
            bg={'componentColorDarkOnly'}
          >
            <OrganizationFilters
              initialStatus={filterStatus}
              onFilterChange={handleFilterChange}
              onSearchChange={setSearchTerm}
              onOpenCreateModal={onModalOpen}
            />
            {isListLoading ? (
              <Flex justify="center" align="center" h="150px">
                <Spinner size="xl" />
              </Flex>
            ) : (
              <OrganizationList
                organizations={filtered}
                onOrganizationSelect={setSelected}
              />
            )}
          </Flex>
        </Flex>

        <Box
          flex="1"
          pl={{ base: 0, md: isDesktopListCollapsed ? '80px' : 0 }}
          transition="padding-left 0.3s ease-in-out"
        >
          <OrganizationDetailsView organizationId={selected} />
        </Box>
      </Flex>

      <CreateOrganizationModal
        isOpen={isModalOpen}
        onClose={onModalClose}
        onCreated={handleOrganizationCreated}
      />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
  try {
    const apiClient = setupAPIClient(ctx);

    const organizationsResponse = await apiClient.get('/organizations', {
      params: { status: 'active' },
    });

    return {
      props: {
        organizations: organizationsResponse.data || [],
      },
    };
  } catch (error) {
    console.log(error);
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false,
      },
    };
  }
});
