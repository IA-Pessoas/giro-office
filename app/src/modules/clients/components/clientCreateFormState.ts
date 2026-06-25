export interface IbgeState {
  id: number;
  sigla: string;
  nome: string;
}

export interface IbgeCity {
  id: number;
  nome: string;
}

export interface ClientCreateFormState {
  type: "PJ" | "PF";
  name: string;
  company_name: string;
  fantasy_name: string;
  cpf_cnpj: string;
  opening_date: string;
  responsible: string;
  cpf_responsible: string;
  number: string;
  email: string;
  agent: string;
  cpf_agent: string;
  instagram: string;
  indication: string;
  type_registration: string;
  service_unique: boolean;
  address: string;
  neighborhood: string;
  cep: string;
  city: string;
  state: string;
}

export const clientCreateInitialFormData: ClientCreateFormState = {
  type: "PJ",
  name: "",
  company_name: "",
  fantasy_name: "",
  cpf_cnpj: "",
  opening_date: "",
  responsible: "",
  cpf_responsible: "",
  number: "",
  email: "",
  agent: "",
  cpf_agent: "",
  instagram: "",
  indication: "",
  type_registration: "Existente",
  service_unique: false,
  address: "",
  neighborhood: "",
  cep: "",
  city: "",
  state: "",
};
