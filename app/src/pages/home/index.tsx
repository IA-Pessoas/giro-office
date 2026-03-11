import { useRouter } from 'next/router';
import { FormEvent, useState, useEffect } from "react";
import Head from "next/head";
import {
    Box,
} from "@chakra-ui/react";
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';

import { ModuleCard } from '@shared/components/ModulosCards'

import { canSSRAuth } from '@modules/auth'
import { setupAPIClient } from '@shared/services/api'

import LogoTI from '../../../public/logos/lions/Tecnologia.png';
import LogoIntegracao from '../../../public/logos/lions/Integracao.png';
import { ToggleThemeButton } from '@shared/components/ToggleThemeButton';


interface PermsItem {
    id: string
    user_id: string
    atendimento: number
    certificado: number
    comercial: number
    contabil: number
    financeiro: number
    fiscal: number
    integracao: number
    marketing: number
    parcelamento: number
    pec: number
    pessoal: number
    regularize: number
    rh: number
    triagem: number
    wiki: number
}
interface Props {
    perm: PermsItem;
}

export default function Dashboard({ perm }: Props) {
    const router = useRouter();

    const [modules, setModules] = useState([]);

    useEffect(() => {
        const listModulesTemp = [];
        
        listModulesTemp.push(
          {
            name: 'Tecnologia',
            imageUrl: LogoTI.src,
            link: '/tecnologia/home/',
            color: '#823382'
          },
        );

        console.log(perm.integracao)
    
        if (perm.integracao !== null) {
            listModulesTemp.push(
                {
                    name: 'Integração',
                    imageUrl: LogoIntegracao.src,
                    link: '/integracao/home/',
                    color: '#ef5a8b'
                },
            );
        }
            
        setModules(listModulesTemp);
      });
      
    return (
        <>
            <Box display="flex" justifyContent="center" alignItems="center" height="100vh" padding="4">
                {modules.map((module) => (
                    <ModuleCard
                        key={module.name}
                        name={module.name}
                        imageUrl={module.imageUrl}
                        link={module.link}
                        color={module.color}
                    />
                ))}
            </Box>
            <Box position="absolute" top={2} right={2}>
                <ToggleThemeButton />
            </Box>
        </>
    );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    try {
        const apiClient = setupAPIClient(ctx);
        const response = await apiClient.get('/me')

        const responsePerms = await apiClient.get('/permission', {
            params: {
                user_id: response.data.user.id,
                modulo: ""
            }
        })

        return {
            props: {
                perm: responsePerms.data.permission,
            }
        }

    } catch (error) {
        // Em caso de erro, redirecionar para login para evitar loop
        return {
            redirect: {
                destination: '/login',
                permanent: false
            }
        }
    }
})