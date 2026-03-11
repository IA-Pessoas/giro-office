import React, { useState, ChangeEvent, useRef, FormEvent, useEffect } from 'react'
import Head from 'next/head'
import {
    useMediaQuery,
    useDisclosure,
} from '@chakra-ui/react'
import 'react-toastify/dist/ReactToastify.css';

import Navbar from "@shared/components/sidebar"
import { canSSRAuth } from '@modules/auth'
import { setupAPIClient } from '@shared/services/api'

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
    
    try {
        const meResponse = await apiClient.get('/me');

        return {
          props: {
            me: meResponse.data.user,
          }
        };
    } catch (error: any) {
        // Se for erro 401, lança AuthTokenError para ser capturado pelo canSSRAuth
        if (error?.response?.status === 401 || error?.message === 'Unauthorized') {
            const { AuthTokenError } = await import('@shared/services/errors/AuthTokenError');
            throw new AuthTokenError();
        }
        
        // Para outros erros, também lança para ser tratado pelo canSSRAuth
        throw error;
    }
})