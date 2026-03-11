import React from 'react';
import Head from 'next/head';
import { Box, Button, SimpleGrid, Heading, Text, Icon } from '@chakra-ui/react';
import { FaTasks } from 'react-icons/fa';
import Link from 'next/link';
import { canSSRAuth } from '@modules/auth';

export default function IntegracaoConfig() {
    return (
        <>
            <Head><title>Configurações - Integração</title></Head>
            <Box p={8}>
                <Heading mb={6} color="primaryText">Configurações da Integração</Heading>
                
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
                    <Link href="/configs/integracao/tasks">
                        <Box 
                            p={6} 
                            bg="componentColorDarkOnly" 
                            borderRadius="lg" 
                            boxShadow="md" 
                            cursor="pointer"
                            transition="0.2s"
                            _hover={{ transform: 'translateY(-2px)', boxShadow: 'lg', border: '1px solid', borderColor: 'integracao.main' }}
                        >
                            <Icon as={FaTasks} w={10} h={10} color="integracao.main" mb={4} />
                            <Heading size="md" mb={2}>Modelos de Tarefas</Heading>
                            <Text color="gray.500">Gerencie os modelos padrão de tarefas recorrentes.</Text>
                        </Box>
                    </Link>
                    {/* Adicione mais cards de configuração aqui no futuro */}
                </SimpleGrid>
            </Box>
        </>
    );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    // Aqui você pode adicionar verificação de permissão no lado do servidor se quiser segurança extra
    return { props: {} };
});