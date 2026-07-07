import { useRouter } from 'next/router';
import { FormEvent, useState, useEffect } from "react";
import Head from "next/head";
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';
import styles from "./HomePage.module.css";

import { ModuleCard } from '@shared/components/ModulosCards'

import { canSSRAuth } from '@modules/auth'
import { setupAPIClient } from '@shared/services/api'

import { ToggleThemeButton } from '@shared/components/ToggleThemeButton';

const LOGO_TECNOLOGIA_URL = "/logos/lions/Tecnologia.webp";
const LOGO_INTEGRACAO_URL = "/logos/lions/Integracao.webp";


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
            imageUrl: LOGO_TECNOLOGIA_URL,
            link: '/tecnologia/home/',
            color: '#823382'
          },
        );

        console.log(perm.integracao)
    
        if (perm.integracao !== null) {
            listModulesTemp.push(
                {
                    name: 'Integração',
                    imageUrl: LOGO_INTEGRACAO_URL,
                    link: '/integracao/home/',
                    color: '#ef5a8b'
                },
            );
        }
            
        setModules(listModulesTemp);
      });
      
    return (
        <>
            <div className={styles.page}>
                {modules.map((module) => (
                    <ModuleCard
                        key={module.name}
                        name={module.name}
                        imageUrl={module.imageUrl}
                        link={module.link}
                        color={module.color}
                    />
                ))}
            </div>
            <div className={styles.themeToggle}>
                <ToggleThemeButton />
            </div>
        </>
    );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    try {
        const apiClient = setupAPIClient(ctx);
        const response = await apiClient.get('/user/me')

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
