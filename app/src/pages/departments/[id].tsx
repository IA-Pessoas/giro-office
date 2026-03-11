import React from 'react';
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
    HStack
} from "@chakra-ui/react";
import 'react-toastify/dist/ReactToastify.css';
import { LuFolder } from "react-icons/lu";
import { IoCreate } from "react-icons/io5";

import { canSSRAuth } from '@features/auth';
import { setupAPIClient } from '@shared/services/api';
import LogDrawer from '@shared/components/LogDrawer';
import { useDepForm, departmentService, type DepItem } from '@features/departments';
interface Props {
    dep: DepItem
}

export default function Department({ dep }: Props) {
    const {
        formData,
        isLoading,
        handleInputChange,
        handleUpdate
    } = useDepForm(dep);

    return (
        <>
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
                                            isChecked={formData.solution} // Controlado pelo estado booleano
                                            onChange={handleInputChange}   // Usa a mesma função!
                                            colorScheme="green"
                                        />
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel>Status</FormLabel>
                                        <Select name="status" value={formData.status} onChange={handleInputChange} color={'bodyText'}>
                                            <option value="Ativo">Ativo</option>
                                            <option value="Inativo"></option>
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
                    <TabPanel>
                        <p>Aqui ficará o inventário do usuário...</p>
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </>
    );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    const { id } = ctx.params;

    try {
        const apiClient = setupAPIClient(ctx);
        const [meResponse, dep] = await Promise.all([
            apiClient.get('/me'),
            departmentService.getById(id as string)
        ]);

        if (!dep || meResponse.data.user.permission === 0) {
            return {
                redirect: {
                    destination: '/dashboard',
                    permanent: false,
                },
            };
        }

        return {
            props: {
                me: meResponse.data.user,
                dep,
            },
        };
    } catch (error) {
        console.log(error);
        return {
            redirect: {
                destination: '/dashboard',
                permanent: false,
            },
        };
    }
});
