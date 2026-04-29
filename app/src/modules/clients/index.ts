export { ClientList } from './components/ClientList';
export { ClientProfile } from './components/ClientProfile';
export { ClientDetailsView } from './components/ClientDetails';
export { ClientFilters } from './components/ClientFilters';
export { ClientForm } from './components/ClientForm';
export { ClientPASection } from './components/ClientPASection';
export { ClientCreateModal } from './components/ClientCreateModal';

export {
  useActivateClientMutation,
  useClient,
  useClientPa,
  useClients,
  useCreateClientMutation,
  useCreateClientPaMutation,
  useDeactivateClientMutation,
  useUpdateClientMutation,
  useUpdateClientPaMutation,
} from './hooks/useClients';
export { useClientList } from './hooks/useClientList';
export { useClientFormComercial } from './hooks/useFormComercial';
export { useClientFormIntegracao } from './hooks/useFormIntegracao';
export { useClientFormRegularize } from './hooks/useFormRegularize';

export { clientService } from './services/clientService';
export {
  mapClientStatusFromApi,
  mapClientStatusToApi,
  type ClientStatusApi,
  type ClientStatusForm,
} from './utils/statusMapper';

export type {
  Client,
  ClientItem,
  ClientFormValues,
  ClientPa,
  ClientPaRelatedClient,
  ClientPaResponse,
  ClientListFilters,
  ClientListPage,
  ClientOrganizationSummary,
  ClientRecord,
  ClientStatus,
  CreateClientData,
  CreateClientPayload,
  Perms,
  UpdateClientPaPayload,
  UpdateClientData,
  UpdateClientPayload,
} from './types';
