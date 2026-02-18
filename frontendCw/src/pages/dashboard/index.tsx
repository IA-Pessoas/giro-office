import React, { useState, ChangeEvent, useRef, FormEvent, useEffect } from 'react'
import Head from 'next/head'
import {
    useMediaQuery,
    useDisclosure,
} from '@chakra-ui/react'
import 'react-toastify/dist/ReactToastify.css';

import Navbar from "../../components/sidebar"
import { canSSRAuth } from '../../utils/canSSRAuth'
import { setupAPIClient } from '../../services/api'

export interface MeItem { id: string; name: string; permission: number; department_id: string; status: string; photo: string | null; }
interface Props { me: MeItem; }

export default function Dashboard({ me }: Props) {
    const apiClient = setupAPIClient();
    const [isLoading, setIsLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isMobile] = useMediaQuery("(max-width: 500px)")
    const [isPortrait] = useMediaQuery("(orientation: portrait)")
    const { isOpen, onOpen, onClose } = useDisclosure()
    const initialRef = useRef<HTMLInputElement>(null)
    const finalRef = useRef(null)

    return (
        <>
            <Head>
                <title>Dashboard</title>
            </Head>

        </>
    )
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    const apiClient = setupAPIClient(ctx);
    
    const [meResponse] = await Promise.all([
      apiClient.get('/me')
    ]);

    return {
      props: {
        me: meResponse.data.user,
      }
    };
})