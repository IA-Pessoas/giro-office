// src/components/users/UserProfile.tsx
import React, { useEffect, useState } from 'react';
import {
    Flex, FormControl, FormLabel, Input, Select, Button,
    Tabs, TabList, TabPanels, Tab, TabPanel, Image
} from "@chakra-ui/react";
import { LuFolder } from "react-icons/lu";
import { FaComputer } from "react-icons/fa6";
import { IoCreate } from "react-icons/io5";
import { setupAPIClient } from '@shared/services/api';
import { useUserForm } from '../hooks/useUserForm';
import LogDrawer from '@/components/LogDrawer';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';

interface UserProfileProps {
    userId: string;
    me: any; // Dados do usuário logado
    departments: any[]; // Lista de departamentos para o Select
}

export function UserProfile({ userId, me, departments }: UserProfileProps) {
    const [user, setUser] = useState(null);
    const [loadingData, setLoadingData] = useState(true);

    // 1. Busca os dados do usuário selecionado
    useEffect(() => {
        async function loadData() {
            try {
                setLoadingData(true);
                const { userService } = await import('../services/userService');
                const userData = await userService.getById(userId);
                setUser(userData);
            } catch (error) {
                console.error("Erro ao carregar usuário", error);
            } finally {
                setLoadingData(false);
            }
        }

        if (userId) {
            loadData();
        }
    }, [userId]);

    if (loadingData || !user) {
        return <LoadingSpinner />;
    }

    return <UserFormContent user={user} me={me} departments={departments} />;
}

// Separamos o formulário para garantir que o hook useUserForm só inicie quando "user" existir
function UserFormContent({ user, me, departments }) {
    const { 
        formData, 
        isLoading, 
        handleInputChange, 
        handleFileChange, 
        handleUpdate 
    } = useUserForm(user); // Seu hook existente

    const permissoes = [
        { id: 0, nome: "Normal" },
        { id: 1, nome: "Sub-Administrador" },
        { id: 2, nome: "Administrador" },
    ];

    return (
        <Tabs>
            <TabList>
                <Tab color={'primaryText'}><LuFolder style={{ marginRight: 8 }} /> Dados</Tab>
                <Tab color={'primaryText'}><FaComputer style={{ marginRight: 8 }} /> Inventário</Tab>
            </TabList>

            <TabPanels>
                <TabPanel>
                    <Flex direction="column" alignItems="center" pt={4} pb={8} w="100%" maxWidth="900px" mx="auto">
                         {/* Lógica de Imagem (igual ao seu arquivo original) */}
                        <label htmlFor="photo-upload">
                            <Image
                                src={formData.photoUrl || "/logos/lions/Grey.png"}
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
                        <Input id="photo-upload" type="file" display="none" accept="image/*" onChange={handleFileChange} />
                        
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
                                    <Input type="password" name="password" placeholder="Deixe em branco para manter" value={formData.password} onChange={handleInputChange} color={'bodyText'} />
                                </FormControl>
                            </Flex>
                            
                            <Flex direction={{ base: "column", md: "row" }} gap={4}>
                                <FormControl>
                                    <FormLabel>Departamento</FormLabel>
                                    <Select name="department_id" value={formData.department_id} onChange={handleInputChange} color={'bodyText'}>
                                        {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                                    </Select>
                                </FormControl>
                                
                                {me.permission >= 1 && (
                                    <>
                                        <FormControl>
                                            <FormLabel>Permissão</FormLabel>
                                            <Select name="permission" value={formData.permission} onChange={handleInputChange} color={'bodyText'}>
                                                {permissoes.filter(p => p.id <= me.permission).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
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
                    <p>Inventário aqui...</p>
                </TabPanel>
            </TabPanels>
        </Tabs>
    );
}