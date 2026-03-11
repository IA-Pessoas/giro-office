import { useState, useContext, useEffect } from "react";
import Head from "next/head";
import { 
    Flex, 
    Text,
    Heading,
    Button,
    Input,
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbSeparator,
} from "@chakra-ui/react";
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';

import { canSSRAuth } from "@modules/auth";
import { IoIosArrowForward } from 'react-icons/io'
import { AuthContext } from "../../context/AuthContext";
import { setupAPIClient } from "@shared/services/api";

interface UserProps {
    id: string;
    name: string;
    login: string;
}

interface Props {
    user: UserProps;
}

export default function Me() {
    const { logoutUser } = useContext(AuthContext);
    const apiClient = setupAPIClient();

    const [name, setName] = useState('');
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');

    async function handleLogout() {
        await logoutUser();
    }

    async function user() {
        const user = await apiClient.get('/me')

        setName(user.data.user.name)
        setLogin(user.data.user.login)
        setPassword(user.data.user.password)
    }

    async function handleUpdate() {

        if (name === '')
            return;

        try {
            const apiClient = setupAPIClient();
            await apiClient.put('/users', {
                name: name,
                password: password,
                permission: 2,
                status: 'Ativo'
            })

            toast.success("Atualizado com sucesso!")

        } catch (error) {
            toast.error("Erro ao atualizar!")
            console.log(error)
        }
    }

    useEffect(() => {
        user();
    }, [])

    return (
        <>
            <Head>
                <title>Meu Perfil - cw</title>
            </Head>
                <Flex direction="column" alignItems="flex-start" justifyContent="flex-start">
                    <Breadcrumb spacing='8px' color='white' separator={<IoIosArrowForward  color='main.400' />}>
                        <BreadcrumbItem isCurrentPage color='orange.900'>
                            <BreadcrumbLink href='#'>Meu Perfil</BreadcrumbLink>
                        </BreadcrumbItem>
                    </Breadcrumb>
                    <Flex bg="main.900" maxWidth="700px" w="100%" pt={8} pb={8} direction="column" alignItems="star" justifyContent="center">
                        <Flex direction="column" w="85%">
                            <Text fontSize="xl" fontWeight="bold" color="main.subText">Login</Text>
                            <Input
                                w="100%"
                                background="main.400"
                                placeholder="Seu Login"
                                color='main.subText'
                                size="lg"
                                mt={2}
                                mb={4}
                                type="text"
                                disabled
                                value={login}
                            />
                            <Text fontSize="xl" fontWeight="bold" color="main.subText">Nome</Text>
                            <Input
                                w="100%"
                                background="main.900"
                                placeholder="Digite seu nome"
                                _placeholder={{ color: 'main.subText'}}
                                color="main.subText"
                                borderColor="main.subText"
                                size="lg"
                                mt={2}
                                mb={4}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                            <Text fontSize="xl" fontWeight="bold" color="main.subText">Senha</Text>
                            <Input
                                w="100%"
                                background="main.900"
                                placeholder="Digite uma nova senha se desejar"
                                _placeholder={{color: 'main.subText'}}
                                size="lg"
                                mt={2}
                                mb={4}
                                type="password"
                                value={password}
                                onChange={ (e) => setPassword(e.target.value)}

                            />

                            <Button
                                w="100%"
                                mt={3}
                                mb={4}
                                size="lg"
                                bg="button.cta"
                                _hover={{ bg: '#ffb13e' }}
                                onClick={handleUpdate}
                            >
                                Salvar
                            </Button>

                            <Button
                                w="100%"
                                mb={6}
                                bg="transparent"
                                color="red.500"
                                borderWidth={2}
                                borderColor="red.500"
                                size="lg"
                                _hover={{ bg: 'transparent' }}
                                onClick={handleLogout}
                            >
                                Sair
                            </Button>
                        </Flex>

                    </Flex>
                </Flex>
        </>
    )
}