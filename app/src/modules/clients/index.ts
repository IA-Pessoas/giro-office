export { ClientList } from './components/ClientList';
export { ClientProfile } from './components/ClientProfile';
export { ClientDetailsView } from './components/ClientDetails';
export { ClientFilters } from './components/ClientFilters';
export { ClientCreateModal } from './components/ClientCreateModal';

export { useClientList } from './hooks/useClientList';
export { useClientFormComercial } from './hooks/useFormComercial';
export { useClientFormIntegracao } from './hooks/useFormIntegracao';
export { useClientFormRegularize } from './hooks/useFormRegularize';

export { clientService } from './services/clientService';

export type { Client, ClientItem, Perms, CreateClientData, UpdateClientData } from './types';
