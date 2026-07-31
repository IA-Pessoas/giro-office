import { useState } from 'react';
import { Button, Flex, FormLabel, Input } from '@shared/ui/chakraShims';
import { IoCreate } from 'react-icons/io5';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';

import StateCity from '../../StateCity';

export default function DataTabIntegracao({ client }) {
    const [id, setId] = useState(client && client?.id)
    const [name, setName] = useState(client && client?.name)
    const [company_name, setCompanyName] = useState(client && client?.company_name)
    const [fantasy_name, setFantasyName] = useState(client && client?.fantasy_name)
    const [cnpj, setCnpj] = useState(client && client?.cnpj)
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
    const [instagram, setInstagram] = useState(client && client?.instagram)
    const [indication, setIndication] = useState(client && client?.indication)

    const [isLoading, setIsLoading] = useState(false);

    async function handleUpdate() {
        if (name === '' || cnpj === '') {
            toast.warn('Preencha todos os campos')
            return
        }

        setIsLoading(true);

        const cleanCnpj = String(cnpj || '').replace(/[^\d]/g, '');
        const cleanCpfResponsible = String(cpf_responsible || '').replace(/[^\d]/g, '');
        const cleanCpfAgent = String(cpf_agent || '').replace(/[^\d]/g, '');

        try {
            const apiClient = setupAPIClient();
            await apiClient.put('/clients-integracao', {
                client_id: id,
                name,
                company_name,
                fantasy_name,
                cnpj: cleanCnpj,
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
                instagram,
                indication,
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
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="fantasy_name">Nome Fantasia</FormLabel>
                                <Input
                                    value={fantasy_name}
                                    onChange={(e) => setFantasyName(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="cnpj">CNPJ</FormLabel>
                                <Input
                                    value={cnpj}
                                    onChange={(e) => setCnpj(e.target.value)}
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
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="instagram">Instagram</FormLabel>
                                <Input
                                    value={instagram}
                                    onChange={(e) => setInstagram(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="indication">Indicação</FormLabel>
                                <Input
                                    value={indication}
                                    onChange={(e) => setIndication(e.target.value)}
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
