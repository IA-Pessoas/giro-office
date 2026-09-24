// Regra única de nome exibido do cliente: razão social, depois nome.
export function getClientDisplayName(client: { name: string; company_name?: string | null }): string {
  return client.company_name || client.name;
}
