import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from "next";

export function canSSRGuest<P>(fn: GetServerSideProps<P>) {
    return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => {
        return await fn(ctx);
    }
}
