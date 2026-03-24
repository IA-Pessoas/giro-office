import React, { useEffect, useState } from 'react';
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
      <div className="u-flex min-h-[400px] h-full items-center justify-center">
        <span className="text-sm text-slate-500">Carregando...</span>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-4">
        <p className="text-red-500">Erro ao carregar organização.</p>
      </div>
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
    <div className="p-6">
      <div className="u-stack u-gap-4">
        <div className="u-flex u-justify-between u-items-center">
          <p className="text-2xl font-bold text-[var(--colors-blue-500)]">
            {organization.name}
          </p>
          <span className={`organization-status-badge ${
            getStatusColor(organization.status) === 'green' ? 'bg-green-100 text-green-700' :
            getStatusColor(organization.status) === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
            getStatusColor(organization.status) === 'orange' ? 'bg-orange-100 text-orange-700' :
            getStatusColor(organization.status) === 'red' ? 'bg-red-100 text-red-700' :
            'bg-slate-100 text-slate-700'
          }`}>
            {organization.status}
          </span>
        </div>

        <section><p className="mb-1 text-sm text-slate-500">Slug</p><p>{organization.slug}</p></section>
        <section><p className="mb-1 text-sm text-slate-500">CNPJ</p><p>{organization.cnpj}</p></section>
        <section><p className="mb-1 text-sm text-slate-500">Email do Criador</p><p>{organization.email_created_by}</p></section>
        <section><p className="mb-1 text-sm text-slate-500">Plano de Assinatura</p><p>{organization.subscription_plan}</p></section>

        {organization.logo_url && (
          <section>
            <p className="mb-1 text-sm text-slate-500">Logo</p>
            <div className="mt-2">
              <img src={organization.logo_url} alt={organization.name} style={{ maxWidth: '200px', maxHeight: '200px' }} />
            </div>
          </section>
        )}

        <section>
          <p className="mb-1 text-sm text-slate-500">Criado em</p>
          <p>
            {new Date(organization.created_at).toLocaleString('pt-BR')}
          </p>
        </section>

        <section>
          <p className="mb-1 text-sm text-slate-500">Atualizado em</p>
          <p>
            {new Date(organization.updated_at).toLocaleString('pt-BR')}
          </p>
        </section>
      </div>
    </div>
  );
}
