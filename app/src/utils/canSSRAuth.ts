import { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { parseCookies, destroyCookie } from 'nookies'
import { AuthTokenError } from '../services/errors/AuthTokenError'

export function canSSRAuth<P>(fn: GetServerSideProps<P>) {
  return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => {
    const cookies = parseCookies(ctx);

    const token = cookies['@cw.token'];

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
      if(err instanceof AuthTokenError){
        destroyCookie(ctx, '@cw.token', { path: '/' });

        return{
          redirect:{
            destination: '/',
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