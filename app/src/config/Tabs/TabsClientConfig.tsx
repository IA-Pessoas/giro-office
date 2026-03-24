import React from 'react';
import { IconType } from 'react-icons';
import { LuFolder, LuPlug, LuBriefcase, LuFileText } from 'react-icons/lu';
import dynamic from 'next/dynamic';

import type { Client, Perms } from '@modules/clients';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';

const DadosGeraisTab = dynamic(() => import('../../components/Tabs/Client/Client').then(mod => mod.clientTab), {
  loading: () => <LoadingSpinner />,
});
const IntegracaoTab = dynamic(() => import('../../components/Tabs/Client/Integracao').then(mod => mod.integracaoTab), {
  loading: () => <LoadingSpinner />,
});
const ComercialTab = dynamic(() => import('../../components/Tabs/Client/Comercial').then(mod => mod.comercialTab), {
  loading: () => <LoadingSpinner />,
});
const RegularizeTab = dynamic(() => import('../../components/Tabs/Client/Regularize').then(mod => mod.regularizeTab), {
  loading: () => <LoadingSpinner />,
});

export interface TabConfig {
  id: string;
  title: string;
  icon: IconType;
  component: React.ComponentType<{ client: any; perms: any }>; // Passando client e perms
  
  permissionKey?: keyof Perms; // Para checar as permissões do usuário
  requiredField?: keyof Client;   // Para checar se o dado existe no cliente
}

export const tabsConfig: TabConfig[] = [
  {
    id: 'dados',
    title: 'Dados',
    icon: LuFolder,
    component: DadosGeraisTab,
  },
  {
    id: 'integracao',
    title: 'Integração',
    icon: LuPlug,
    component: IntegracaoTab,
    permissionKey: 'integracao',
  },
  {
    id: 'comercial',
    title: 'Comercial',
    icon: LuBriefcase,
    component: ComercialTab,
    permissionKey: 'comercial',
  },
  {
    id: 'regularize',
    title: 'Regularize',
    icon: LuFileText,
    component: RegularizeTab,
    permissionKey: 'regularize',
  },
];