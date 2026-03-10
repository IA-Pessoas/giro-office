import React from 'react';
import {
  Button, 
  Flex, 
  FormLabel, 
  Input, 
  Tabs, 
  TabList, 
  TabPanels, 
  Tab, 
  TabPanel, 
  Select, 
  Image,
  FormControl
} from "@chakra-ui/react";
import 'react-toastify/dist/ReactToastify.css';
import { LuFolder } from "react-icons/lu";
import { FaComputer } from "react-icons/fa6";
import { IoCreate } from "react-icons/io5";

import { canSSRAuth } from '@features/auth';
import { setupAPIClient } from '@shared/services/api';
import { UserProfile, type UserItem } from '@features/users';
import type { DepItem } from '@features/departments';
import { useUserForm } from '../../hooks/users/useUserForm'; // Importando o nosso hook!
import LogDrawer from '@/components/LogDrawer';

// Interfaces (idealmente, mova-as para um arquivo compartilhado types.ts)
interface UserItem { id: string; name: string; login: string; password: string; permission: number; department_id: string; status: string; photo: string | null; }
interface DepItem { id: string; name: string; color: string; status: string; }
interface MeItem { id: string; name: string; permission: number; /* ... */ }
interface Props { me: MeItem; user: UserItem; deps: DepItem[]; }

export default function User({ me, user, deps }: Props) {
  const { 
    formData, 
    isLoading, 
    handleInputChange, 
    handleFileChange, 
    handleUpdate 
  } = useUserForm(user);
    
  const permissoes = [
    { id: 0, nome: "Normal" },
    { id: 1, nome: "Sub-Administrador" },
    { id: 2, nome: "Administrador" },
  ];
  
  return (
    <>
      <Tabs>
        <TabList>
          <Tab color={'primaryText'}><LuFolder style={{ marginRight: 8 }} /> Dados</Tab>
          <Tab color={'primaryText'}><FaComputer style={{ marginRight: 8 }} /> Inventário</Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <Flex direction="column" alignItems="center" pt={4} pb={8} w="100%" maxWidth="900px" mx="auto">
              <label htmlFor="photo-upload">
                <Image
                  src={formData.photoUrl || "/logos/lions/Grey.png"} // Mostra o preview ou a imagem padrão
                  alt="Foto do Usuário"
                  boxSize="120px"
                  borderRadius="full"
                  objectFit="cover"
                  cursor="pointer"
                  mb={4}
                  border="2px solid"
                  borderColor="gray.200"
                  _hover={{ opacity: 0.8 }}
                />
              </label>
              <Input
                id="photo-upload"
                type="file"
                display="none"
                accept="image/*"
                onChange={handleFileChange}
              />
              
              <Flex as="form" direction="column" w="100%" gap={4} onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
                <Flex direction={{ base: "column", md: "row" }} gap={4}>
                  <FormControl isDisabled>
                    <FormLabel>Login</FormLabel>
                    <Input value={user?.login || ''} readOnly />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Nome</FormLabel>
                    <Input name="name" value={formData.name} onChange={handleInputChange} color={'bodyText'} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Nova Senha</FormLabel>
                    <Input type="password" name="password" placeholder="Deixe em branco para não alterar" value={formData.password} onChange={handleInputChange} color={'bodyText'} />
                  </FormControl>
                </Flex>
                
                <Flex direction={{ base: "column", md: "row" }} gap={4}>
                  <FormControl>
                    <FormLabel>Departamento</FormLabel>
                    <Select name="department_id" value={formData.department_id} onChange={handleInputChange} color={'bodyText'}>
                      {deps.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                    </Select>
                  </FormControl>
                  
                  {me.permission >= 1 && (
                    <>
                      <FormControl>
                        <FormLabel>Permissão</FormLabel>
                        <Select name="permission" value={formData.permission} onChange={handleInputChange} color={'bodyText'}>
                          {permissoes
                            .filter(p => p.id <= me.permission)
                            .map(p => <option key={p.id} value={p.id}>{p.nome}</option>)
                          }
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel>Status</FormLabel>
                        <Select name="status" value={formData.status} onChange={handleInputChange} color={'bodyText'}>
                          <option value='Ativo'>Ativo</option>
                          <option value='Inativo'>Inativo</option>
                        </Select>
                      </FormControl>
                    </>
                  )}
                </Flex>

                <Flex mt={6} justify="space-between" align="center">
                  <LogDrawer referring="users" referringId={user.id} />
                  <Button
                    type="submit"
                    leftIcon={<IoCreate />}
                    size="lg"
                    bg="componentColor"
                    color="white"
                    isLoading={isLoading}
                    _hover={{ bg: 'componentColorReverse' }}
                  >
                    Salvar Alterações
                  </Button>
                </Flex>
              </Flex>
            </Flex>
          </TabPanel>
          <TabPanel>
            <p>Aqui ficará o inventário do usuário...</p>
          </TabPanel>
        </TabPanels>
      </Tabs>
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