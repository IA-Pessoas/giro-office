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
  useCreateClientIntegrationMutation,
  useCreateClientPaMutation,
  useDeactivateClientMutation,
  useTerminateClientMutation,
  useUpdateClientMutation,
  useUpdateClientCommercialMutation,
  useUpdateClientFinanceMutation,
  useUpdateClientIntegrationMutation,
  useUpdateClientPaMutation,
  useUpdateClientRegularizeMutation,
} from './hooks/useClients';
export { useClientList } from './hooks/useClientList';
export { useClientFormComercial } from './hooks/useFormComercial';
export { useClientFormIntegracao } from './hooks/useFormIntegracao';
export { useClientFormRegularize } from './hooks/useFormRegularize';

export { clientService } from './services/clientService';
export { ClientIntegrationForm } from './components/ClientIntegrationForm';
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
  ClientCommercialFormValues,
  ClientCommercialRecord,
  ClientFinanceFormValues,
  ClientFinanceRecord,
  ClientIntegrationFormValuesBase,
  ClientPa,
  ClientPaRelatedClient,
  ClientPaResponse,
  CreateClientIntegrationFormValues,
  CreateClientIntegrationPayload,
  ClientListFilters,
  ClientListPage,
  ClientOrganizationSummary,
  ClientRecord,
  ClientStatus,
  ClientTerminationFormValues,
  ClientTerminationRecord,
  CreateClientData,
  CreateClientPayload,
  Perms,
  TerminateClientPayload,
  UpdateClientCommercialPayload,
  UpdateClientFinancePayload,
  UpdateClientPaPayload,
  UpdateClientData,
  UpdateClientIntegrationFormValues,
  UpdateClientIntegrationPayload,
  UpdateClientRegularizePayload,
  UpdateClientPayload,
  ClientRegularizeFormValues,
} from './types';
