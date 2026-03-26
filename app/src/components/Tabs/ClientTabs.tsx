import React, { useMemo } from 'react';
import { tabsConfig } from '../../config/Tabs/TabsClientConfig';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@shared/components';

interface ClientTabsProps {
  client: any; 
  perms: any;
}

export const ClientTabs = ({ client, perms }: ClientTabsProps) => {
  const visibleTabs = useMemo(() => {
    if (!perms) return tabsConfig.filter(tab => !tab.permissionKey && !tab.requiredField);

    return tabsConfig.filter(tab => {
      // Condição 1: A aba precisa de permissão do usuário?
      let hasUserPermission = false;
      if (!tab.permissionKey) {
        // Se a chave não for definida, todos têm permissão.
        hasUserPermission = true; 
      } else {
        // Se a chave for definida, verifica se o valor é maior que 0 (ou não nulo).
        if (perms[tab.permissionKey] !== null) {
          hasUserPermission = true;
        }
      }

      // Condição 2: A aba precisa de um dado existente no cliente?
      let hasDataRequirement = false;
      if (!tab.requiredField) {
        // Se o campo não for definido, não há requisito de dados.
        hasDataRequirement = true;
      } else {
        // Se o campo for definido, verifica se o valor não é nulo/undefined.
        if (client[tab.requiredField] !== null && client[tab.requiredField] !== undefined) {
            hasDataRequirement = true;
        }
      }

      // A aba só será exibida se AMBAS as condições forem verdadeiras.
      return hasUserPermission && hasDataRequirement;
    });
  }, [client, perms]); // A lista agora depende tanto do cliente quanto das permissões

  // O resto do componente não muda
  return (
    <TabsRoot defaultValue={visibleTabs[0]?.id ?? 'tab-0'}>
      <TabsList>
        {visibleTabs.map(tab => (
          <TabsTrigger key={tab.id} value={tab.id}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <tab.icon />
              {tab.title}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {visibleTabs.map(tab => (
        <TabsContent key={tab.id} value={tab.id}>
          <div style={{ padding: 0 }}>
            <tab.component client={client} perms={perms} />
          </div>
        </TabsContent>
      ))}
    </TabsRoot>
  );
};