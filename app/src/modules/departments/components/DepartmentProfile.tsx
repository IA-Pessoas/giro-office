// src/components/departments/DepartmentProfile.tsx
import React, { useEffect, useState } from 'react';
import { LuFolder } from "react-icons/lu";
import { IoCreate } from "react-icons/io5";
import styles from './DepartmentProfile.module.css';

import LogDrawer from '@shared/components/LogDrawer';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
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
        <div className={styles.root}>
            <div className={styles.tabHeader}>
                <span className={styles.tab}><LuFolder style={{ marginRight: 8 }} /> Dados</span>
            </div>

            <div className={styles.panel}>
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
            </div>
        </div>
    );
}