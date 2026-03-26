import { useState } from 'react';
import { 
    Button, 
    Flex, 
    FormLabel, 
    Input, 
    Select, 
    Switch, 
} from "@shared/ui/clientTabPrimitives";
import { IoCreate } from 'react-icons/io5';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';

import StateCity from '../../StateCity';
import { formatDateToInput } from '@shared/utils/formatters';

export default function DataTabRegularize({ client }) {
    const [id, setId] = useState(client && client?.id)
    const [dominio_code, setDominioCode] = useState(client && client?.dominio_code)
    const [name, setName] = useState(client && client?.name)
    const [company_name, setCompanyName] = useState(client && client?.company_name)
    const [fantasy_name, setFantasyName] = useState(client && client?.fantasy_name)
    const [cnpj, setCnpj] = useState(client && client?.cnpj)
    const [cnae, setCnae] = useState(client && client?.cnae)
    const [responsible, setResponsible] = useState(client && client?.responsible)
    const [cpf_responsible, setCpfResponsible] = useState(client && client?.cpf_responsible)
    const [agent, setAgent] = useState(client && client?.agent)
    const [cpf_agent, setCpfAgent] = useState(client && client?.cpf_agent)
    const [number, setNumber] = useState(client && client?.number)
    const [email, setEmail] = useState(client && client?.email)
    const [address, setAddress] = useState(client && client?.address)
    const [cep, setCep] = useState(client && client?.cep)
    const [neighborhood, setNeighorhood] = useState(client && client?.neighborhood)
    const [state, setState] = useState(client && client?.state)
    const [city, setCity] = useState(client && client?.city)
    const [customer_since, setCustomerSince] = useState(client && client?.customer_since)
    const [municipal_registration, setMunicipalRegistration] = useState(client && client?.municipal_registration)
    const [state_registration, setStateRegistration] = useState(client && client?.state_registration)
    const [commercial_board_registration, setCommercialBoardRegistration] = useState(client && client?.commercial_board_registration)
    const [opening_date, setOpeningDate] = useState(client && client?.opening_date)
    const [regime, setRegime] = useState(client && client?.regime)
    const [size, setSize] = useState(client && client?.size)
    const [segment, setSegment] = useState(client && client?.segment)
    const [contabil, setContabil] = useState(!!client?.contabil)
    const [fiscal, setFiscal] = useState(!!client?.fiscal)
    const [pessoal, setPessoal] = useState(!!client?.pessoal)
    const [infoproduto, setInfoproduto] = useState(!!client?.infoproduto)
    const [consultoria, setConsultoria] = useState(!!client?.consultoria)
    const [castelo_med, setCasteloMed] = useState(!!client?.castelo_med)
    const [start_strike, setStartStrike] = useState(client && client?.start_strike)
    const [end_strike, setEndStrike] = useState(client && client?.end_strike)

    const [isLoading, setIsLoading] = useState(false);

    async function handleUpdate() {
        if (name === '' || cnpj === '') {
            alert('Preencha todos os campos')
            return
        }

        setIsLoading(true);

        const cleanCnpj = String(cnpj || '').replace(/[^\d]/g, '');
        const cleanCpfResponsible = String(cpf_responsible || '').replace(/[^\d]/g, '');
        const cleanCpfAgent = String(cpf_agent || '').replace(/[^\d]/g, '');

        try {
            const apiClient = setupAPIClient();
            await apiClient.put('/clients-regularize', {
                client_id: id,
                dominio_code,
                name,
                company_name,
                fantasy_name,
                cnpj: cleanCnpj,
                cnae,
                responsible,
                cpf_responsible: cleanCpfResponsible,
                agent,
                cpf_agent: cleanCpfAgent,
                number,
                email,
                address,
                cep,
                neighborhood,
                state,
                city,
                customer_since,
                municipal_registration,
                state_registration,
                commercial_board_registration,
                opening_date: opening_date ? new Date(opening_date) : null,
                regime,
                size,
                segment,
                contabil,
                fiscal,
                pessoal,
                infoproduto,
                consultoria,
                start_strike: start_strike ? new Date(start_strike) : null,
                end_strike: end_strike ? new Date(end_strike) : null
            })

            toast.success("Atualizado com sucesso!")
        } catch (err) {
            console.log(err);
            toast.error('Erro ao Atualizar!')
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Flex direction="column" alignItems="flex-start" justifyContent="flex-start">
            <Flex w="100%" maxWidth="1280px" pt={8} pb={8} direction="column" alignItems="center" justifyContent="center">
                <Flex w="100%" direction="column" justifyContent="center" alignItems="center">
                    <Flex w="100%" direction="column" p={5}>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="name">Nome</FormLabel>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="company_name">Razão Social</FormLabel>
                                <Input
                                    value={company_name}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="fantasy_name">Nome Fantasia</FormLabel>
                                <Input
                                    value={fantasy_name}
                                    onChange={(e) => setFantasyName(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="cnpj">CNPJ</FormLabel>
                                <Input
                                    value={cnpj}
                                    onChange={(e) => setCnpj(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="25%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="dominio_code">Cod. Dominio</FormLabel>
                                <Input
                                    value={dominio_code}
                                    onChange={(e) => setDominioCode(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="cnae">CNAE</FormLabel>
                                <Input
                                    value={cnae}
                                    onChange={(e) => setCnae(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="responsible">Sócio Administrador</FormLabel>
                                <Input
                                    value={responsible}
                                    onChange={(e) => setResponsible(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="cpf_responsible">CPF Sócio Administrador</FormLabel>
                                <Input
                                    value={cpf_responsible}
                                    onChange={(e) => setCpfResponsible(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="agent">Preposto</FormLabel>
                                <Input
                                    value={agent}
                                    onChange={(e) => setAgent(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="cpf_agent">CPF Preposto</FormLabel>
                                <Input
                                    value={cpf_agent}
                                    onChange={(e) => setCpfAgent(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="number">Telefone</FormLabel>
                                <Input
                                    value={number}
                                    onChange={(e) => setNumber(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="email">E-mail</FormLabel>
                                <Input
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="address">Endereço</FormLabel>
                                <Input
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="cep">CEP</FormLabel>
                                <Input
                                    value={cep}
                                    onChange={(e) => setCep(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="neighborhood">Bairro</FormLabel>
                                <Input
                                    value={neighborhood}
                                    onChange={(e) => setNeighorhood(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <StateCity
                                initialState={state}
                                initialCity={city}
                                onChangeState={(uf) => setState(uf)}
                                onChangeCity={(cidade) => setCity(cidade)}
                            />
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="customer_since">Cliente desde</FormLabel>
                                <Input
                                    type='date'
                                    value={formatDateToInput(customer_since)}
                                    onChange={(e) => setCustomerSince(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="municipal_registration">Inscrição municipal</FormLabel>
                                <Input
                                    value={municipal_registration}
                                    onChange={(e) => setMunicipalRegistration(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="state_registration">Inscrição estadual</FormLabel>
                                <Input
                                    value={state_registration}
                                    onChange={(e) => setStateRegistration(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="commercial_board_registration">Registro na junta comercial</FormLabel>
                                <Input
                                    value={commercial_board_registration}
                                    onChange={(e) => setCommercialBoardRegistration(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="opening_date">Data de abertura</FormLabel>
                                <Input
                                    type='date'
                                    value={formatDateToInput(opening_date)}
                                    onChange={(e) => setOpeningDate(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="regime">Regime</FormLabel>
                                <Select
                                    placeholder="Selecione um..."
                                    value={regime}
                                    onChange={(e) => setRegime(e.target.value)}
                                    borderColor='main.divisor'
                                >
                                    <option>CAEPF</option>
                                    <option>CNO</option>
                                    <option>E-Social</option>
                                    <option>Isento de IRPF</option>
                                    <option>Lucro Presumido</option>
                                    <option>Lucro Real</option>
                                    <option>MEI</option>
                                    <option>Simples Nacional</option>
                                </Select>
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="size">Porte</FormLabel>
                                <Select
                                    placeholder="Selecione um..."
                                    value={size}
                                    onChange={(e) => setSize(e.target.value)}
                                    borderColor='main.divisor'
                                >
                                    <option>DEMAIS</option>
                                    <option>EPP</option>
                                    <option>ME</option>
                                </Select>
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="segment">Segmento</FormLabel>
                                <Input
                                    value={segment}
                                    onChange={(e) => setSegment(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="contabil-switch">Contábil</FormLabel>
                                <Switch
                                    id="contabil-switch"
                                    isChecked={contabil}
                                    onChange={(e) => setContabil(e.target.checked)}
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="fiscal-switch">Fiscal</FormLabel>
                                <Switch
                                    id="fiscal-switch"
                                    isChecked={fiscal}
                                    onChange={(e) => setFiscal(e.target.checked)}
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="pessoal-switch">Pessoal</FormLabel>
                                <Switch
                                    id="pessoal-switch"
                                    isChecked={pessoal}
                                    onChange={(e) => setPessoal(e.target.checked)}
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="infoproduto-switch">Infoproduto</FormLabel>
                                <Switch
                                    id="infoproduto-switch"
                                    isChecked={infoproduto}
                                    onChange={(e) => setInfoproduto(e.target.checked)}
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="consultoria-switch">Consultoria</FormLabel>
                                <Switch
                                    id="consultoria-switch"
                                    isChecked={consultoria}
                                    onChange={(e) => setConsultoria(e.target.checked)}
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="castelomed-switch">Castelo Med</FormLabel>
                                <Switch
                                    id="castelomed-switch"
                                    isChecked={castelo_med}
                                    onChange={(e) => setCasteloMed(e.target.checked)}
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="start_strike">Inicio Paralisação</FormLabel>
                                <Input
                                    type='date'
                                    value={formatDateToInput(start_strike)}
                                    onChange={(e) => setStartStrike(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="end_strike">Fim Paralisação</FormLabel>
                                <Input
                                    type='date'
                                    value={formatDateToInput(end_strike)}
                                    onChange={(e) => setEndStrike(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex direction="row" alignItems={'center'} w="100%" gap={2}>
                            <Flex w="100%" direction="row" alignItems={'center'} justifyContent={'space-around'}>
                                <Button
                                    leftIcon={<IoCreate />}
                                    w="40%"
                                    mt={3}
                                    mb={4}
                                    size="lg"
                                    bg="main.main"
                                    color="white"
                                    isLoading={isLoading}
                                    isDisabled={isLoading}
                                    _hover={{ bg: 'main.mainDourado', color: 'main.main' }}
                                    onClick={handleUpdate}
                                >
                                    Salvar
                                </Button>
                            </Flex>
                        </Flex>
                    </Flex>
                </Flex>
            </Flex>
        </Flex>
    );
}
