import React from 'react';
import 'react-toastify/dist/ReactToastify.css';

import { canSSRAuth } from '@modules/auth';
import { setupAPIClient } from '@shared/services/api';
import { UserProfile, type UserItem } from '@modules/users';
import type { DepItem } from '@modules/departments';

interface MeItem { id: string; name: string; permission: number; }
interface Props { me: MeItem; user: UserItem; deps: DepItem[]; }

export default function User({ me, user, deps }: Props) {
  return (
    <>
      <UserProfile userId={user.id} me={me} departments={deps} />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
  const { id } = ctx.params as { id: string };
  try {
    const apiClient = setupAPIClient(ctx);
    // Otimização: Buscando dados em paralelo
    const [meResponse, userResponse, depsResponse] = await Promise.all([
      apiClient.get('/me'),
      apiClient.get('/users-detail', { params: { user_id: id } }),
      apiClient.get('/departments')
    ]);

    const user = userResponse.data.user;
    const me = meResponse.data.user;
    
    // Regra de permissão
    if (!user || (me.permission === 0 && me.id !== id)) {
      return { redirect: { destination: '/dashboard', permanent: false } };
    }
    
    return {
      props: {
        me,
        user,
        deps: depsResponse.data,
      },
    };
  } catch (error) {
    console.log(error);
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
});