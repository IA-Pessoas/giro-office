export { ClientList } from './components/ClientList';
export { ClientProfile } from './components/ClientProfile';
export { ClientDetailsView } from './components/ClientDetails';
export { ClientFilters } from './components/ClientFilters';
export { ClientForm } from './components/ClientForm';
export { ClientCreateModal } from './components/ClientCreateModal';

export { useActivateClientMutation, useClient, useClients, useCreateClientMutation, useDeactivateClientMutation, useUpdateClientMutation } from './hooks/useClients';
export { useClientList } from './hooks/useClientList';
export { useClientFormComercial } from './hooks/useFormComercial';
export { useClientFormIntegracao } from './hooks/useFormIntegracao';
export { useClientFormRegularize } from './hooks/useFormRegularize';

export { clientService } from './services/clientService';
export { mapClientStatusFromApi, mapClientStatusToApi } from './utils/statusMapper';

export type {
  Client,
  ClientItem,
  ClientFormValues,
  ClientListFilters,
  ClientListPage,
  ClientOrganizationSummary,
  ClientRecord,
  ClientStatus,
  CreateClientData,
  CreateClientPayload,
  Perms,
  UpdateClientData,
  UpdateClientPayload,
} from './types';
