import { useState, useContext } from "react"
import Head from "next/head"
import Image from "next/image"
import { Flex, Center, Text, Input, Button } from "@chakra-ui/react"

import { setupAPIClient } from "@/services/api"

import { AuthContext } from "../../context/AuthContext"
import { canSSRGuest } from "@features/auth"

export default function Login() {
    const { signIn } = useContext(AuthContext)

    const [login, setLogin] = useState('')
    const [password, setPassword] = useState('')

    async function handleLogin() {
        if (login === '' || password === '' ) {
            return;
        }

        await signIn({
            login,
            password
        })
    }

    function handleKeyPress(event) {
        if (event.key === 'Enter') {
            handleLogin();
        }
    }

    return(
        <>
            <Head>
                <title>Login - cw</title>
            </Head>
            <Flex background={"main.900"} height="100vh" alignItems="center" justifyContent="center" >
                
                <Flex width={640} direction="column" p={14} rounded={8}>
                    <Center p={4}>
                        <Text 
                            fontSize={100}    
                            color='orange.900'
                        >
                            cw
                        </Text>
                    </Center>

                    <Input
                        background="main.400"
                        variant="filled"
                        size="lg"
                        placeholder="Digite seu Login"
                        type="text"
                        mb={3}
                        value={login}
                        onChange={ (e) => setLogin(e.target.value) }
                        onKeyPress={handleKeyPress}
                    />

                    <Input
                        background="main.400"
                        variant="filled"
                        size="lg"
                        placeholder="Digite sua senha"
                        type="password"
                        mb={6}
                        value={password}
                        onChange={ (e) => setPassword(e.target.value) }
                        onKeyPress={handleKeyPress}
                    />

                    <Button 
                        background="button.cta"
                        mb={6}
                        color="grey.900"
                        size="lg"
                        _hover={{ bg: "#ffb13e" }}
                        onClick={handleLogin}
                    >
                        Acessar
                    </Button>

                </Flex>

            </Flex>
        </>
    )
}

// Verificação se esta logado
export const getServerSideProps = canSSRGuest(async(ctx) => {
    return {
        props: {

        }
    }
})