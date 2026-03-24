import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { FaBuilding } from 'react-icons/fa';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { canSSRAuth } from '@modules/auth';
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const onModalOpen = () => setIsModalOpen(true);
  const onModalClose = () => setIsModalOpen(false);

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

      <section className="organizations-shell u-split-panel relative">
        <aside
          className={`organizations-sidebar group relative z-20 flex flex-col items-center justify-center overflow-hidden transition-all duration-300 md:h-[90vh] ${isDesktopListCollapsed ? 'md:absolute md:w-[80px] md:min-w-[80px]' : 'md:w-[350px] md:min-w-[350px]'}`}
        >
          <div className={`absolute hidden h-20 w-20 items-center justify-center transition-opacity md:flex ${isDesktopListCollapsed ? 'opacity-100 group-hover:opacity-0' : 'opacity-0'}`}>
            <FaBuilding size={28} color="var(--colors-blue-500)" />
          </div>

          <div
            className={`h-full w-full bg-white transition-opacity duration-300 md:w-[350px] ${isDesktopListCollapsed ? 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100' : 'opacity-100'}`}
          >
            <OrganizationFilters
              initialStatus={filterStatus}
              onFilterChange={handleFilterChange}
              onSearchChange={setSearchTerm}
              onOpenCreateModal={onModalOpen}
            />
            {isListLoading ? (
              <div className="u-flex h-[150px] items-center justify-center">
                <span className="text-sm text-slate-500">Carregando...</span>
              </div>
            ) : (
              <OrganizationList
                organizations={filtered}
                onOrganizationSelect={setSelected}
              />
            )}
          </div>
        </aside>

        <section className={`flex-1 transition-all duration-300 ${isDesktopListCollapsed ? 'md:pl-[80px]' : 'md:pl-0'}`}>
          <OrganizationDetailsView organizationId={selected} />
        </section>
      </section>

      <CreateOrganizationModal
        isOpen={isModalOpen}
        onClose={onModalClose}
        onCreated={handleOrganizationCreated}
      />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
  return {
    props: {
      organizations: [],
    },
  };
});
