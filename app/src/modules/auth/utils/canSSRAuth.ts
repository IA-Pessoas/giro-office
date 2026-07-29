import { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { parseCookies, destroyCookie } from 'nookies'
import { AuthTokenError } from '@shared/services/errors/AuthTokenError'

export function canSSRAuth<P>(fn: GetServerSideProps<P>) {
  return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => {
    const cookies = parseCookies(ctx);

    const token = cookies['cw.token'];

    if(!token){
      return{
        redirect:{
          destination: '/login',
          permanent: false,
        }
      }
    }

    try{
      return await fn(ctx);
    }catch(err){
      // Sempre destrói o cookie em caso de erro para evitar loops
      destroyCookie(ctx, 'cw.token', { path: '/' });
      
      if(err instanceof AuthTokenError || (err instanceof Error && (err.message === 'Unauthorized' || err.message.includes('401')))){
        return{
          redirect:{
            destination: '/login',
            permanent: false
          }
        }
      }
      
      // Qualquer outro erro: redireciona para login
      return {
        redirect: {
          destination: '/login',
          permanent: false
        }
      };
    }

  }
}