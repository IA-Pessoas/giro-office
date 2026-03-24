import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { IoSearch } from 'react-icons/io5';
import axios from 'axios';

import { clientService } from '../services/clientService';
import { Dialog } from '@shared/components';
import type { ClientItem, Perms } from '../types';

interface CreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (newClient: ClientItem) => void;
    perm: Perms;
}

const initialFormData = {
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

interface State {
    id: number;
    sigla: string;
    nome: string;
}

interface City {
    id: number;
    nome: string;
}


// --- SUB-COMPONENTS FOR FORMS ---

const IntegracaoForm = ({ formData, handleInputChange, isSearchingCnpj, handleSearchCNPJ, states, cities }: { formData: any, handleInputChange: any, isSearchingCnpj: boolean, handleSearchCNPJ: any, states: State[], cities: City[] }) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="u-stack u-gap-2"><span className="users-section-title">Tipo de Pessoa</span><select className="ui-input" name="type" value={formData.type} onChange={handleInputChange}><option value="PJ">Pessoa Jurídica (PJ)</option><option value="PF">Pessoa Física (PF)</option></select></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Tipo de Registro</span><select className="ui-input" name="type_registration" value={formData.type_registration} onChange={handleInputChange}><option value="Existente">Existente</option><option value="Novo">Novo</option><option value="Constituição de Empresa">Constituição de Empresa</option></select></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">{formData.type === 'PJ' ? 'CNPJ' : 'CPF'}</span><div className="u-flex u-gap-2"><input className="ui-input" name="cpf_cnpj" value={formData.cpf_cnpj} onChange={handleInputChange} placeholder="Apenas números" />{formData.type === 'PJ' && (<button type="button" className="rounded-md border px-3" onClick={handleSearchCNPJ} disabled={isSearchingCnpj} title="Buscar dados na Receita">{isSearchingCnpj ? '...' : <IoSearch />}</button>)}</div></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Nome / Apelido</span><input className="ui-input" name="name" value={formData.name} onChange={handleInputChange} /></label>
        {formData.type === 'PJ' && (<><label className="u-stack u-gap-2"><span className="users-section-title">Razão Social</span><input className="ui-input" name="company_name" value={formData.company_name} onChange={handleInputChange} /></label><label className="u-stack u-gap-2"><span className="users-section-title">Nome Fantasia</span><input className="ui-input" name="fantasy_name" value={formData.fantasy_name} onChange={handleInputChange} /></label><label className="u-stack u-gap-2"><span className="users-section-title">Data de Abertura</span><input className="ui-input" type="date" name="opening_date" value={formData.opening_date} onChange={handleInputChange} /></label></>)}
        <label className="u-stack u-gap-2"><span className="users-section-title">CEP</span><input className="ui-input" name="cep" value={formData.cep} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Endereço Completo</span><input className="ui-input" name="address" value={formData.address} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Bairro</span><input className="ui-input" name="neighborhood" value={formData.neighborhood} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Estado</span><select className="ui-input" name="state" value={formData.state} onChange={handleInputChange}><option value="">Selecione o estado</option>{states.map(state => (<option key={state.id} value={state.sigla}>{state.nome}</option>))}</select></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Cidade</span><select className="ui-input" name="city" value={formData.city} onChange={handleInputChange} disabled={!formData.state}><option value="">Selecione a cidade</option>{cities.map(city => (<option key={city.id} value={city.nome}>{city.nome}</option>))}</select></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Telefone</span><input className="ui-input" name="number" value={formData.number} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2 md:col-span-2"><span className="users-section-title">E-mail</span><input className="ui-input" type="email" name="email" value={formData.email} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Responsável Legal</span><input className="ui-input" name="responsible" value={formData.responsible} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">CPF Responsável</span><input className="ui-input" name="cpf_responsible" value={formData.cpf_responsible} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Preposto</span><input className="ui-input" name="agent" value={formData.agent} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">CPF Preposto</span><input className="ui-input" name="cpf_agent" value={formData.cpf_agent} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Instagram</span><input className="ui-input" name="instagram" value={formData.instagram} onChange={handleInputChange} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Indicação</span><input className="ui-input" name="indication" value={formData.indication} onChange={handleInputChange} /></label>
        <label className="u-flex u-items-center u-gap-2"><span className="users-section-title">Serviço Único?</span><input id="service_unique" name="service_unique" type="checkbox" checked={formData.service_unique} onChange={handleInputChange} /></label>
    </div>
);



export function ClientCreateModal({ isOpen, onClose, onCreated, perm }: CreateModalProps) {
    const [formData, setFormData] = useState(initialFormData);
    const [isLoading, setIsLoading] = useState(false);
    const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
    const [states, setStates] = useState<State[]>([]);
    const [cities, setCities] = useState<City[]>([]);

    useEffect(() => {
        if (isOpen) {
            setFormData(initialFormData); // Reset form on open
            axios.get('https://servicodados.ibge.gov.br/api/v1/localidades/estados').then(response => {
                setStates(response.data);
            });
        }
    }, [isOpen]);

    useEffect(() => {
        if (formData.state) {
            axios.get(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${formData.state}/municipios`).then(response => {
                setCities(response.data);
            });
        }
    }, [formData.state]);

    useEffect(() => {
        if (formData.type === 'PF') {
            setFormData(prev => ({ ...prev, company_name: "", fantasy_name: "", opening_date: "" }));
        }
    }, [formData.type]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type: inputType } = e.target;
        const finalValue = inputType === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleSearchCNPJ = async () => {
        // ... (implementation remains the same)
    };

    const handleCadastrar = async () => {
        if (!formData.name || !formData.cpf_cnpj) {
            toast.warn('Preencha Nome e CPF/CNPJ!');
            return;
        }
        setIsLoading(true);

        const cleanDoc = formData.cpf_cnpj.replace(/[^\d]/g, '');
        const cleanCpfResp = formData.cpf_responsible.replace(/[^\d]/g, '');
        const cleanCpfAgent = formData.cpf_agent.replace(/[^\d]/g, '');
        
        try {
            const payload = {
                ...formData,
                cpf_cnpj: cleanDoc,
                cpf_responsible: cleanCpfResp,
                cpf_agent: cleanCpfAgent,
                opening_date: formData.opening_date ? new Date(formData.opening_date) : null,
            };
            const newClient = await clientService.create(payload);
            toast.success("Cliente cadastrado com sucesso!");
            onCreated(newClient);
            onClose();
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || 'Erro ao cadastrar cliente.';
            toast.error(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => { if (!open) onClose(); }}
            title="Cadastrar Novo Cliente"
            description="Formulário para cadastro de cliente"
            contentClassName="max-w-[1400px]"
            footer={(
                <>
                    <button type="button" className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100" onClick={onClose}>Cancelar</button>
                    <button type="button" className="ui-button-primary" disabled={isLoading} onClick={handleCadastrar}>{isLoading ? 'Salvando...' : 'Salvar'}</button>
                </>
            )}
        >
                <div className="max-h-[70vh] overflow-y-auto">
                    <IntegracaoForm
                        formData={formData}
                        handleInputChange={handleInputChange}
                        isSearchingCnpj={isSearchingCnpj}
                        handleSearchCNPJ={handleSearchCNPJ}
                        states={states}
                        cities={cities}
                    />
                </div>
        </Dialog>
    );
}