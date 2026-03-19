import React, { useState, useEffect } from 'react';
import {
    Modal, FormControl, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton, Button, Flex, FormLabel, Input, SimpleGrid, Switch, Select, InputGroup, InputRightElement, IconButton, Spinner
} from '@chakra-ui/react';
import { toast } from 'react-toastify';
import { SearchIcon } from '@chakra-ui/icons';
import axios from 'axios';

import { clientService } from '../services/clientService';
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
    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        <FormControl isRequired>
            <FormLabel>Tipo de Pessoa</FormLabel>
            <Select name="type" value={formData.type} onChange={handleInputChange} color={'bodyText'}>
                <option value="PJ">Pessoa Jurídica (PJ)</option>
                <option value="PF">Pessoa Física (PF)</option>
            </Select>
        </FormControl>
        <FormControl isRequired>
            <FormLabel>Tipo de Registro</FormLabel>
            <Select name="type_registration" value={formData.type_registration} onChange={handleInputChange} color={'bodyText'}>
                <option value="Existente">Existente</option>
                <option value="Novo">Novo</option>
                <option value="Constituição de Empresa">Constituição de Empresa</option>
            </Select>
        </FormControl>
        <FormControl isRequired>
            <FormLabel>{formData.type === 'PJ' ? 'CNPJ' : 'CPF'}</FormLabel>
            <InputGroup>
                <Input name="cpf_cnpj" value={formData.cpf_cnpj} onChange={handleInputChange} color={'bodyText'} placeholder="Apenas números" />
                {formData.type === 'PJ' && (
                    <InputRightElement>
                        <IconButton aria-label="Buscar CNPJ" icon={isSearchingCnpj ? <Spinner size="sm" /> : <SearchIcon />} size="sm" onClick={handleSearchCNPJ} isLoading={isSearchingCnpj} title="Buscar dados na Receita" />
                    </InputRightElement>
                )}
            </InputGroup>
        </FormControl>
        <FormControl isRequired>
            <FormLabel>Nome / Apelido</FormLabel>
            <Input name="name" value={formData.name} onChange={handleInputChange} color={'bodyText'} />
        </FormControl>
        {formData.type === 'PJ' && (
            <>
                <FormControl><FormLabel>Razão Social</FormLabel><Input name="company_name" value={formData.company_name} onChange={handleInputChange} color={'bodyText'} /></FormControl>
                <FormControl><FormLabel>Nome Fantasia</FormLabel><Input name="fantasy_name" value={formData.fantasy_name} onChange={handleInputChange} color={'bodyText'} /></FormControl>
                <FormControl><FormLabel>Data de Abertura</FormLabel><Input type="date" name="opening_date" value={formData.opening_date} onChange={handleInputChange} color={'bodyText'} /></FormControl>
            </>
        )}
        <FormControl><FormLabel>CEP</FormLabel><Input name="cep" value={formData.cep} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl><FormLabel>Endereço Completo</FormLabel><Input name="address" value={formData.address} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl><FormLabel>Bairro</FormLabel><Input name="neighborhood" value={formData.neighborhood} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl>
            <FormLabel>Estado</FormLabel>
            <Select name="state" value={formData.state} onChange={handleInputChange} color={'bodyText'}>
                <option value="">Selecione o estado</option>
                {states.map(state => (
                    <option key={state.id} value={state.sigla}>{state.nome}</option>
                ))}
            </Select>
        </FormControl>
        <FormControl>
            <FormLabel>Cidade</FormLabel>
            <Select name="city" value={formData.city} onChange={handleInputChange} color={'bodyText'} isDisabled={!formData.state}>
                <option value="">Selecione a cidade</option>
                {cities.map(city => (
                    <option key={city.id} value={city.nome}>{city.nome}</option>
                ))}
            </Select>
        </FormControl>
        <FormControl><FormLabel>Telefone</FormLabel><Input name="number" value={formData.number} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl gridColumn={{ md: "span 2" }}><FormLabel>E-mail</FormLabel><Input type="email" name="email" value={formData.email} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl><FormLabel>Responsável Legal</FormLabel><Input name="responsible" value={formData.responsible} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl><FormLabel>CPF Responsável</FormLabel><Input name="cpf_responsible" value={formData.cpf_responsible} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl><FormLabel>Preposto</FormLabel><Input name="agent" value={formData.agent} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl><FormLabel>CPF Preposto</FormLabel><Input name="cpf_agent" value={formData.cpf_agent} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl><FormLabel>Instagram</FormLabel><Input name="instagram" value={formData.instagram} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl><FormLabel>Indicação</FormLabel><Input name="indication" value={formData.indication} onChange={handleInputChange} color={'bodyText'} /></FormControl>
        <FormControl display="flex" alignItems="center"><FormLabel htmlFor="service_unique" mb="0">Serviço Único?</FormLabel><Switch id="service_unique" name="service_unique" isChecked={formData.service_unique} onChange={handleInputChange} colorScheme="green" /></FormControl>
    </SimpleGrid>
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
        <Modal isOpen={isOpen} onClose={onClose} size="6xl">
            <ModalOverlay />
            <ModalContent maxWidth="1400px" mx="auto">
                <ModalHeader color='primaryText'>Cadastrar Novo Cliente</ModalHeader>
                <ModalCloseButton />
                <ModalBody maxHeight="70vh" overflowY="auto">
                    <IntegracaoForm
                        formData={formData}
                        handleInputChange={handleInputChange}
                        isSearchingCnpj={isSearchingCnpj}
                        handleSearchCNPJ={handleSearchCNPJ}
                        states={states}
                        cities={cities}
                    />
                </ModalBody>
                <ModalFooter>
                    <Button colorScheme="gray" mr={3} onClick={onClose}>Cancelar</Button>
                    <Button
                        bg="componentColor" color={'secondaryText'} border={'1px solid transparent'}
                        _hover={{ bg: 'white', color: 'main.main' }}
                        isLoading={isLoading}
                        onClick={handleCadastrar}
                    >
                        Salvar
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}