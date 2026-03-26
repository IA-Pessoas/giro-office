import { useState, useRef } from 'react';
import { 
    Box,
    Button, 
    ButtonGroup,
    Flex, 
    FormLabel, 
    Input,
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverHeader,
    PopoverBody,
    PopoverFooter,
    PopoverArrow,
    PopoverCloseButton,
    PopoverAnchor,  
    Select,
} from "@shared/ui/clientTabPrimitives";
import { IoCreate } from 'react-icons/io5';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';
import { formatDateToInput } from '@shared/utils/formatters';

export default function DataTabComercial({ client }) {
    const [id, setId] = useState(client && client?.id)
    const [service, setService] = useState(client && client?.service)
    const [solucao, setSolucao] = useState(client && client?.solucao)
    const [prospecting_status, setProspecting_status] = useState(client && client?.prospecting_status)
    const [date_status, setDate_status] = useState(client && client?.date_status)
    const [description_prospecting, setDescription_prospecting] = useState(client && client?.description_prospecting)
    const [month_prospecting, setMonth_prospecting] = useState(client && client?.month_prospecting)
    const [register_date_prospecting, setRegister_date_prospecting] = useState(client && client?.register_date_prospecting)
    const [participants_meet, setParticipants_meet] = useState(client && client?.participants_meet)
    const [meet_type, setMeet_type] = useState(client && client?.meet_type)
    
    const [competence_output, setCompetenceOutput] = useState(client && client?.competence_output)

    const [isLoading, setIsLoading] = useState(false);
    const initialFocusRef = useRef()

    async function handleUpdate() {
        if (prospecting_status === '' || prospecting_status == null) {
            alert('Preencha todos os campos')
            return
        }

        setIsLoading(true);

        try {
            const apiClient = setupAPIClient();
            await apiClient.put('/clients-comercial', {
                client_id: id,
                service,
                solucao,
                prospecting_status,
                date_status: date_status ? new Date(date_status) : null,
                description_prospecting,
                month_prospecting,
                register_date_prospecting,
                participants_meet,
                meet_type
            })

            toast.success("Atualizado com sucesso!")
        } catch (err) {
            console.log(err);
            toast.error('Erro ao Atualizar!')
        } finally {
            setIsLoading(false);
        }
    }

    async function handleDistrato() {
        if (competence_output === '' || competence_output === null) {
            alert('Preencha a competencia de saída')
            return
        }

        const dateObject = new Date(competence_output + "-01");

        try {
            const apiClient = setupAPIClient()
            await apiClient.put('/clients-distrato', {
                client_id: id,
                competence_output: dateObject
            })

            toast.success("Gerada com sucesso!")

        } catch (err) {
            console.log(err);
            toast.error('Erro ao Gerar!')
        }
    }


    return (
        <Flex direction="column" alignItems="flex-start" justifyContent="flex-start">
            <Flex w="100%" maxWidth="1280px" pt={8} pb={8} direction="column" alignItems="center" justifyContent="center">
                <Flex w="100%" direction="column" justifyContent="center" alignItems="center">
                    <Flex w="100%" direction="column" p={5}>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="service">Serviço</FormLabel>
                                <Input
                                    value={service}
                                    onChange={(e) => setService(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="solucao">Solução</FormLabel>
                                <Select
                                    placeholder="Selecione um..."
                                    value={solucao}
                                    onChange={(e) => setSolucao(e.target.value)}
                                    borderColor='main.divisor'
                                >
                                    <option>Castelo</option>
                                    <option>Kalango</option>
                                    <option>Meta</option>
                                    <option>NIT</option>
                                </Select>
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="prospecting_status">Status Prospecção</FormLabel>
                                <Select
                                    placeholder="Selecione um..."
                                    value={prospecting_status}
                                    onChange={(e) => setProspecting_status(e.target.value)}
                                    borderColor='main.divisor'
                                >
                                    <option value="Análise Financeira">Análise Financeira</option>
                                    <option value="Análise/Agendamento">Análise/Agendamento</option>
                                    <option value="Envio de Proposta">Envio de Proposta</option>
                                    <option value="Paralisado">Paralisado</option>
                                    <option value="Recusado pelo Cliente">Recusado pelo Cliente</option>
                                    <option value="Fechado">Fechado</option>
                                </Select>
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="date_status">Data do Status da Prospecção</FormLabel>
                                <Input
                                    type='date'
                                    value={formatDateToInput(date_status)}
                                    onChange={(e) => setDate_status(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="responsible">Mês</FormLabel>
                                <Select
                                    placeholder="Selecione um..."
                                    value={month_prospecting}
                                    onChange={(e) => setMonth_prospecting(e.target.value)}
                                    borderColor='main.divisor'
                                >
                                    <option value="Janeiro">Janeiro</option>
                                    <option value="Fevereiro">Fevereiro</option>
                                    <option value="Março">Março</option>
                                    <option value="Abril">Abril</option>
                                    <option value="Maio">Maio</option>
                                    <option value="Junho">Junho</option>
                                    <option value="Julho">Julho</option>
                                    <option value="Agosto">Agosto</option>
                                    <option value="Setembro">Setembro</option>
                                    <option value="Outubro">Outubro</option>
                                    <option value="Novembro">Novembro</option>
                                    <option value="Dezembro">Dezembro</option>
                                </Select>
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="register_date_prospecting">Data do Cadastro</FormLabel>
                                <Input
                                    type='date'
                                    value={formatDateToInput(register_date_prospecting)}
                                    onChange={(e) => setRegister_date_prospecting(e.target.value)}
                                    borderColor='main.divisor'
                                    disabled
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="description_prospecting">Status da Prospecção</FormLabel>
                                <Input
                                    value={description_prospecting}
                                    onChange={(e) => setDescription_prospecting(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                        </Flex>
                        <Flex w="100%" direction="row" gap={2}>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="participants_meet">Participantes 1ª Reunião</FormLabel>
                                <Input
                                    value={participants_meet}
                                    onChange={(e) => setParticipants_meet(e.target.value)}
                                    borderColor='main.divisor'
                                />
                            </Flex>
                            <Flex w="50%" direction="column" justifyContent={'flex-end'}>
                                <FormLabel htmlFor="meet_type">Modo da Reunião</FormLabel>
                                <Input
                                    value={meet_type}
                                    onChange={(e) => setMeet_type(e.target.value)}
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
                            <Popover
                                initialFocusRef={initialFocusRef}
                                placement='auto'
                                closeOnBlur={false}
                            >
                                <PopoverTrigger>
                                    <Button>Distrato</Button>
                                </PopoverTrigger>
                                <PopoverContent>
                                    <PopoverHeader pt={4} fontWeight='bold' border='0'>
                                        Gerar Distrato
                                    </PopoverHeader>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <PopoverBody>
                                        <Input
                                            type='month'
                                            value={competence_output}
                                            onChange={(e) => setCompetenceOutput(e.target.value)}
                                            borderColor='main.divisor'
                                        />
                                    </PopoverBody>
                                    <PopoverFooter
                                        border='0'
                                        display='flex'
                                        alignItems='center'
                                        justifyContent='space-between'
                                        pb={4}
                                    >
                                        <ButtonGroup size='sm'>
                                            <Button colorScheme='red' onClick={handleDistrato}>Gerar</Button>
                                        </ButtonGroup>
                                    </PopoverFooter>
                                </PopoverContent>
                            </Popover>
                        </Flex>
                    </Flex>
                </Flex>
            </Flex>
        </Flex>
    );
}
