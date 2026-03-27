import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import axios from "axios";

import { Dialog } from "@shared/components";
import { clientService } from "../services/clientService";
import type { ClientItem, CreateClientData, Perms } from "../types";
import { ClientCreateFormFields } from "./ClientCreateFormFields";
import {
  clientCreateInitialFormData,
  type ClientCreateFormState,
  type IbgeCity,
  type IbgeState,
} from "./clientCreateFormState";

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newClient: ClientItem) => void;
  perm?: Perms;
}

interface BrasilCnpjResponse {
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  uf?: string;
  municipio?: string;
  ddd_telefone_1?: string;
}

export function ClientCreateModal({ isOpen, onClose, onCreated }: CreateModalProps) {
  const [formData, setFormData] = useState<ClientCreateFormState>(clientCreateInitialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [states, setStates] = useState<IbgeState[]>([]);
  const [cities, setCities] = useState<IbgeCity[]>([]);

  useEffect(() => {
    if (isOpen) {
      setFormData(clientCreateInitialFormData);
      axios
        .get<IbgeState[]>("https://servicodados.ibge.gov.br/api/v1/localidades/estados")
        .then((response) => {
          setStates(response.data.sort((a, b) => a.nome.localeCompare(b.nome)));
        })
        .catch(() => {
          toast.error("Não foi possível carregar estados (IBGE).");
        });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!formData.state) {
      setCities([]);
      return;
    }
    axios
      .get<IbgeCity[]>(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${formData.state}/municipios`,
      )
      .then((response) => {
        setCities(response.data.sort((a, b) => a.nome.localeCompare(b.nome)));
      })
      .catch(() => {
        setCities([]);
        toast.error("Não foi possível carregar cidades (IBGE).");
      });
  }, [formData.state]);

  useEffect(() => {
    if (formData.type === "PF") {
      setFormData((prev) => ({ ...prev, company_name: "", fantasy_name: "", opening_date: "" }));
    }
  }, [formData.type]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type: inputType } = e.target;
    const finalValue =
      inputType === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: finalValue }));
  };

  const handleSearchCNPJ = useCallback(async () => {
    const digits = formData.cpf_cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.warn("Informe um CNPJ com 14 dígitos.");
      return;
    }
    setIsSearchingCnpj(true);
    try {
      const { data } = await axios.get<BrasilCnpjResponse>(
        `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
      );
      const addressLine = [data.logradouro, data.numero, data.complemento].filter(Boolean).join(", ");
      setFormData((prev) => ({
        ...prev,
        name: data.razao_social ?? prev.name,
        company_name: data.razao_social ?? prev.company_name,
        fantasy_name: data.nome_fantasia ?? prev.fantasy_name,
        cep: data.cep?.replace(/\D/g, "") ?? prev.cep,
        address: addressLine || prev.address,
        neighborhood: data.bairro ?? prev.neighborhood,
        state: data.uf ?? prev.state,
        city: data.municipio ?? prev.city,
        number: data.ddd_telefone_1 ?? prev.number,
      }));
      toast.success("Dados do CNPJ carregados.");
    } catch {
      toast.error("Não foi possível buscar o CNPJ.");
    } finally {
      setIsSearchingCnpj(false);
    }
  }, [formData.cpf_cnpj]);

  const handleCadastrar = async () => {
    if (!formData.name || !formData.cpf_cnpj) {
      toast.warn("Preencha Nome e CPF/CNPJ!");
      return;
    }
    setIsLoading(true);

    const cleanDoc = formData.cpf_cnpj.replace(/\D/g, "");
    const cleanCpfResp = formData.cpf_responsible.replace(/\D/g, "");
    const cleanCpfAgent = formData.cpf_agent.replace(/\D/g, "");

    try {
      const payload: CreateClientData = {
        ...formData,
        type: formData.type,
        cpf_cnpj: cleanDoc,
        cpf_responsible: cleanCpfResp,
        cpf_agent: cleanCpfAgent,
        opening_date: formData.opening_date ? new Date(formData.opening_date) : null,
      };
      const newClient = await clientService.create(payload);
      toast.success("Cliente cadastrado com sucesso!");
      onCreated(newClient);
      onClose();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      const errorMsg = ax.response?.data?.error ?? "Erro ao cadastrar cliente.";
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title="Cadastrar Novo Cliente"
      description="Formulário para cadastro de cliente"
      contentClassName="w-[min(96vw,1280px)] max-h-[92vh] dark:border-gray-700"
      bodyClassName="pb-0"
      footer={
        <>
          <button
            type="button"
            className="rounded-xl border-2 border-slate-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-xl px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            disabled={isLoading}
            onClick={handleCadastrar}
          >
            {isLoading ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <div className="max-h-[72vh] overflow-y-auto pr-1">
        <ClientCreateFormFields
          formData={formData}
          onChange={handleInputChange}
          states={states}
          cities={cities}
          isSearchingCnpj={isSearchingCnpj}
          onSearchCnpj={handleSearchCNPJ}
        />
      </div>
    </Dialog>
  );
}
