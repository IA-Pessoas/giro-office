import React, { useState, useEffect } from 'react';
import { Box, Heading, SimpleGrid, Tag } from '@chakra-ui/react';
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';
import { IoCreate } from "react-icons/io5";

import { setupAPIClient } from '@shared/services/api';
import type { Client, Perms } from '@features/clients';

import { ActionButton } from '../../Infos/ActionButton';
import { DataRow } from '../../Infos/DataRow';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';

interface ClientTabProps {
    client: Client;
    perms: Perms;
}

export const clientTab = ({ client, perms }: ClientTabProps) => {
    const apiClient = setupAPIClient();
    const [isDownloading, setIsDownloading] = useState(false);
    const [projects, setProjects] = useState([]);
    const [isLoadingPage, setIsLoadingPage] = useState(true);

    const renderBoolean = (value) => {
        if (value === null || value === undefined) return <Tag colorScheme="gray">N/I</Tag>;
        return value ? <Tag colorScheme="green">Sim</Tag> : <Tag colorScheme="red">Não</Tag>;
    };
    const formatDate = (dateString) => {
        if (!dateString) return <Tag colorScheme="gray">N/I</Tag>;
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('pt-BR');
    };

    useEffect(() => {
        const fetchPorjects = async () => {
            try {
                const response = await apiClient.get('/integracao-projects', {
                    params: {
                        ref: 'client',
                        id: client.id
                    }
                });
                setProjects(response.data);
            } catch (error) {
                console.error("Erro ao buscar projetos:", error);
            } finally {
                setIsLoadingPage(false);
            }
        }

        fetchPorjects()
    })

    const handleProjetoClick = async (projectId: string) => {
        if (!projectId) {
            toast.error("ID do projeto não encontrado.");
            return;
        }

        setIsDownloading(true); // Ativa o estado de carregamento

        try {
            const response = await apiClient.post('/report-projeto',
                { project_id: projectId }, // Este é o corpo (body) da sua requisição
                {
                    // Diz ao Axios para tratar a resposta como um arquivo binário
                    responseType: 'blob',
                }
            );

            // 1. Pega o nome do arquivo do header da resposta (boa prática)
            const contentDisposition = response.headers['content-disposition'];
            let filename = `relatorio-projeto-${projectId}.pdf`; // Nome padrão
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
                if (filenameMatch.length > 1) {
                    filename = filenameMatch[1];
                }
            }

            // 2. Cria um URL temporário para o arquivo recebido (que está na memória)
            const url = window.URL.createObjectURL(new Blob([response.data]));

            // 3. Cria um link "fantasma" para iniciar o download
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);

            // 4. Adiciona o link ao corpo do documento, clica nele e remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // 5. Limpa o URL temporário da memória
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Erro ao gerar relatório:", error);
            toast.error('Erro ao gerar o relatório.');
        } finally {
            setIsDownloading(false); // Desativa o estado de carregamento, mesmo se der erro
        }
    };

    if (isLoadingPage) {
        return <LoadingSpinner />;
    }

    return (
        <Box p={4}>
            <Heading as="h3" size="md" mb={4}>
                Projetos
            </Heading>
            <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} spacing={4} mb={6}>
                {projects.map(project => (
                    <ActionButton key={project.id} icon={IoCreate} onClick={() => handleProjetoClick(project.id)} status={project.status}>
                        {isDownloading ? 'Gerando...' : `${project.name}`}
                    </ActionButton>
                ))}
            </SimpleGrid>
            <Heading as="h3" size="md" mb={4}>
                Identificação da Empresa
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacingX={8} spacingY={2}>
                <DataRow label="Nome / Apelido">{client.name}</DataRow>
                <DataRow label="Razão Social">{client.company_name}</DataRow>
                <DataRow label="Nome Fantasia">{client.fantasy_name}</DataRow>
                <DataRow label="CNPJ">{client.cnpj}</DataRow>
                <DataRow label="Código Domínio">{client.dominio_code}</DataRow>
                <DataRow label="Data de Abertura">{formatDate(client.opening_date)}</DataRow>
            </SimpleGrid>

            <Heading as="h3" size="md" mt={8} mb={4}  pt={13} borderTop={'1px solid'} borderColor={'borderColor'}>
                Informações Fiscais e de Atividade
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacingX={8} spacingY={2}>
                <DataRow label="CNAE Principal">{client.cnae}</DataRow>
                <DataRow label="CNAE Secundário">{client.cnae_secondary}</DataRow>
                <DataRow label="Inscrição Municipal">{client.municipal_registration}</DataRow>
                <DataRow label="Inscrição Estadual">{client.state_registration}</DataRow>
                <DataRow label="Reg. Junta Comercial">{client.commercial_board_registration}</DataRow>
                <DataRow label="Regime Tributário">{client.regime}</DataRow>
                <DataRow label="Porte da Empresa">{client.size}</DataRow>
                <DataRow label="Segmento">{client.segment}</DataRow>
            </SimpleGrid>

            <Heading as="h3" size="md" mt={8} mb={4}  pt={13} borderTop={'1px solid'} borderColor={'borderColor'}>
                Contatos e Responsáveis
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacingX={8} spacingY={2}>
                <DataRow label="Responsável Legal">{client.responsible}</DataRow>
                <DataRow label="CPF do Responsável">{client.cpf_responsible}</DataRow>
                <DataRow label="Agente Comercial">{client.agent}</DataRow>
                <DataRow label="CPF do Agente">{client.cpf_agent}</DataRow>
                <DataRow label="Telefone">{client.number}</DataRow>
                <DataRow label="E-mail">{client.email}</DataRow>
                <DataRow label="Instagram">{client.instagram}</DataRow>
            </SimpleGrid>

            <Heading as="h3" size="md" mt={8} mb={4}  pt={13} borderTop={'1px solid'} borderColor={'borderColor'}>
                Endereço
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacingX={8} spacingY={2}>
                <DataRow label="Endereço">{client.address}</DataRow>
                <DataRow label="CEP">{client.cep}</DataRow>
                <DataRow label="Bairro">{client.neighborhood}</DataRow>
                <DataRow label="Estado">{client.state}</DataRow>
                <DataRow label="Cidade">{client.city}</DataRow>
            </SimpleGrid>

            <Heading as="h3" size="md" mt={8} mb={4}  pt={13} borderTop={'1px solid'} borderColor={'borderColor'}>
                Status e Datas Importantes
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacingX={8} spacingY={2}>
                <DataRow label="Status">{client.status}</DataRow>
                <DataRow label="Cliente Desde">{formatDate(client.customer_since)}</DataRow>
                <DataRow label="Entrada de Competência">{client.competence_entry}</DataRow>
                <DataRow label="Saída de Competência">{client.competence_output}</DataRow>
                <DataRow label="Início da Greve">{formatDate(client.start_strike)}</DataRow>
                <DataRow label="Fim da Greve">{formatDate(client.end_strike)}</DataRow>
                <DataRow label="Data de Exclusão">{formatDate(client.deletion_date)}</DataRow>
            </SimpleGrid>

            <Heading as="h3" size="md" mt={8} mb={4}  pt={13} borderTop={'1px solid'} borderColor={'borderColor'}>
                Dados da Prospecção
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacingX={8} spacingY={2}>
                <DataRow label="Indicação">{client.indication}</DataRow>
                <DataRow label="Participantes Reunião">{client.participants_meet}</DataRow>
                <DataRow label="Tipo de Reunião">{client.meet_type}</DataRow>
                <DataRow label="Status da Prospecção">{client.prospecting_status}</DataRow>
                <DataRow label="Data do Status">{formatDate(client.date_status)}</DataRow>
                <DataRow label="Data de Registro">{formatDate(client.register_date_prospecting)}</DataRow>
                <DataRow label="Data de Fechamento">{formatDate(client.closing_date)}</DataRow>
                <DataRow label="Descrição">{client.description_prospecting}</DataRow>
            </SimpleGrid>

            <Heading as="h3" size="md" mt={8} mb={4}  pt={13} borderTop={'1px solid'} borderColor={'borderColor'}>
                Serviços Contratados
            </Heading>
            <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacingX={8} spacingY={2}>
                <DataRow label="Contrato">{client.contract}</DataRow>
                <DataRow label="Serviço Único">{renderBoolean(client.service_unique)}</DataRow>
                <DataRow label="Contábil">{renderBoolean(client.contabil)}</DataRow>
                <DataRow label="Fiscal">{renderBoolean(client.fiscal)}</DataRow>
                <DataRow label="Pessoal">{renderBoolean(client.pessoal)}</DataRow>
                <DataRow label="Infoproduto">{renderBoolean(client.infoproduto)}</DataRow>
                <DataRow label="Consultoria">{renderBoolean(client.consultoria)}</DataRow>
                <DataRow label="Castelo Med">{renderBoolean(client.castelo_med)}</DataRow>
            </SimpleGrid>
        </Box>
    )
}