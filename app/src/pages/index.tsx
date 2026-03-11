import Head from "next/head"
import { Flex, Text } from "@chakra-ui/react"

import { setupAPIClient } from "@shared/services/api"
import { canSSRGuest } from "@modules/auth"

export default function Home() {
    return(
        <>
            <Head>
                <title>cw</title>
            </Head>
            <Flex background={"main.900"} height="100vh" alignItems="center" justifyContent="center" >
                <Text fontSize={30}>Home</Text>
            </Flex>
        </>
    )
}

// Verificação se esta logado
export const getServerSideProps = canSSRGuest(async(ctx) => {
    try {
        return {
            props: {}
        }
    } catch (error) {
        console.log(error);
        return { props: {} };
    }
})