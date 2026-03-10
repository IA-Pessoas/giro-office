// src/components/departments/DepartmentProfile.tsx
import React, { useEffect, useState } from 'react';
import {
    Button,
    Flex,
    FormLabel,
    FormControl,
    Input,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
    Select,
    Switch,
} from "@chakra-ui/react";
import { LuFolder } from "react-icons/lu";
import { IoCreate } from "react-icons/io5";

import LogDrawer from '@/components/LogDrawer';
import { LoadingSpinner } from '../../../components/layout/LoadingSpinner';
import { setupAPIClient } from '@shared/services/api';
import { useDepForm } from '../hooks/useDepForm';

interface DepartmentProfileProps {
    depId: string;
}

export function DepartmentProfile({ depId }: DepartmentProfileProps) {
    const [dep, setDep] = useState(null);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                setIsLoadingData(true);
                const apiClient = setupAPIClient();
                const response = await apiClient.get('/department', {
                    params: { dep_id: depId }
                });
                setDep(response.data.dep);
            } catch (error) {
                console.error("Erro ao carregar departamento", error);
            } finally {
                setIsLoadingData(false);
            }
        }

        if (depId) {
            loadData();
        }
    }, [depId]);

    if (isLoadingData || !dep) {
        return <LoadingSpinner />;
    }

    return <DepartmentFormContent dep={dep} />;
}

// Separamos o conteúdo para garantir que o hook useDepForm receba os dados carregados
function DepartmentFormContent({ dep }) {
    const {
        formData,
        isLoading,
        handleInputChange,
        handleUpdate
    } = useDepForm(dep);

    return (
        <Tabs>
            <TabList>
                <Tab color={'primaryText'}><LuFolder style={{ marginRight: 8 }} /> Dados</Tab>
            </TabList>

            <TabPanels>
                <TabPanel>
                    <Flex direction="column" alignItems="center" pt={4} pb={8} w="100%" maxWidth="900px" mx="auto">
                        <Flex as="form" direction="column" w="100%" gap={4} onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
                            <Flex direction={{ base: "column", md: "row" }} gap={4}>
                                <FormControl>
                                    <FormLabel>Nome</FormLabel>
                                    <Input name="name" value={formData.name} onChange={handleInputChange} color={'bodyText'} />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Cor</FormLabel>
                                    <Input type="color" name="color" value={formData.color} onChange={handleInputChange} color={'bodyText'} />
                                </FormControl>
                            </Flex>

                            <Flex direction={{ base: "column", md: "row" }} gap={4}>
                                <FormControl>
                                    <FormLabel htmlFor="solution" mb="0">
                                        Solução?
                                    </FormLabel>
                                    <Switch
                                        id="solution"
                                        name="solution"
                                        isChecked={formData.solution}
                                        onChange={handleInputChange}
                                        colorScheme="green"
                                    />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Status</FormLabel>
                                    <Select name="status" value={formData.status} onChange={handleInputChange} color={'bodyText'}>
                                        <option value="Ativo">Ativo</option>
                                        <option value="Inativo">Inativo</option>
                                    </Select>
                                </FormControl>
                            </Flex>

                            <Flex mt={6} justify="space-between" align="center">
                                <LogDrawer referring="departments" referringId={dep.id} />
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
            </TabPanels>
        </Tabs>
    );
}