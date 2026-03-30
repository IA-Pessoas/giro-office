import React from 'react';
import 'react-toastify/dist/ReactToastify.css';
import { LuFolder } from "react-icons/lu";
import { IoCreate } from "react-icons/io5";
import styles from './DepartmentPage.module.css';

import { canSSRAuth } from '@modules/auth';
import { setupAPIClient } from '@shared/services/api';
import LogDrawer from '@shared/components/LogDrawer';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@shared/components';
import { useDepForm, departmentService, type DepItem } from '@modules/departments';
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
            <TabsRoot defaultValue="dados">
                <TabsList>
                    <TabsTrigger value="dados">
                        <span className="inline-flex items-center gap-2 text-sm">
                            <LuFolder />
                            Dados
                        </span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="dados">
                        <div className={styles.wrapper}>
                            <form className={styles.form} onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
                                <div className={styles.row}>
                                    <div className={styles.field}>
                                        <label>Nome</label>
                                        <input name="name" value={formData.name} onChange={handleInputChange} />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Cor</label>
                                        <input type="color" name="color" value={formData.color} onChange={handleInputChange} />
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.field}>
                                        <label htmlFor="solution">Solução?</label>
                                        <input
                                            id="solution"
                                            name="solution"
                                            type="checkbox"
                                            checked={formData.solution}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Status</label>
                                        <select name="status" value={formData.status} onChange={handleInputChange}>
                                            <option value="Ativo">Ativo</option>
                                            <option value="Inativo">Inativo</option>
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.actions}>
                                    <LogDrawer referring="departments" referringId={dep.id} />
                                    <button
                                        type="submit"
                                        className={styles.saveButton}
                                        disabled={isLoading}
                                    >
                                        <IoCreate />
                                        Salvar Alterações
                                    </button>
                                </div>
                            </form>
                        </div>
                </TabsContent>
            </TabsRoot>
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
