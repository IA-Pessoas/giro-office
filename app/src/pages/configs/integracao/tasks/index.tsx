import React, { useState, useMemo, useRef } from 'react';
import Head from 'next/head';
import { IoAdd, IoPencil, IoTrash, IoSearch } from 'react-icons/io5';
import { canSSRAdmin, isAdminPermission } from '@modules/auth';
import { useTaskModels, TaskModelModal, type TaskModel } from '@modules/integracao';
import { useMe } from '@shared/hooks';
import styles from './TaskModelsPage.module.css';

export default function TaskModelsConfig() {
    const { models, isLoading, createModel, updateModel, deleteModel } = useTaskModels();
    const meQuery = useMe();
    const canManageTaskModels = isAdminPermission(meQuery.data?.permission);
    
    // Estados do Modal de Criação/Edição
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedModel, setSelectedModel] = useState<TaskModel | null>(null);

    // Estados da Busca
    const [searchTerm, setSearchTerm] = useState('');

    // Estados do Modal de Exclusão
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const [modelToDelete, setModelToDelete] = useState<string | null>(null);
    const cancelRef = useRef<HTMLButtonElement>(null); // Ref mantida para compatibilidade

    // --- Lógica de Criação/Edição ---
    const handleOpenCreate = () => {
        if (!canManageTaskModels) {
            return;
        }

        setSelectedModel(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (model: TaskModel) => {
        if (!canManageTaskModels) {
            return;
        }

        setSelectedModel(model);
        setIsModalOpen(true);
    };

    const handleSave = async (data: any) => {
        if (!canManageTaskModels) {
            return false;
        }

        if (selectedModel) {
            return await updateModel(data);
        } else {
            return await createModel(data);
        }
    };

    // --- Lógica de Exclusão (Novo Modal) ---
    const handleOpenDelete = (id: string) => {
        if (!canManageTaskModels) {
            return;
        }

        setModelToDelete(id);
        setIsDeleteAlertOpen(true);
    };

    const onCloseDelete = () => {
        setIsDeleteAlertOpen(false);
        setModelToDelete(null);
    };

    const confirmDelete = async () => {
        if (modelToDelete && canManageTaskModels) {
            await deleteModel(modelToDelete);
            onCloseDelete();
        }
    };

    // --- Lógica de Filtragem ---
    const filteredModels = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return models.filter((model) => {
            // Verifica o Nome
            const matchName = model.name.toLowerCase().includes(lowerSearch);
            
            // Verifica o Tipo (Lógica visual que você usou na tabela)
            const typeLabel = model.billing === 'Realizar' ? 'Produto' : 'Tarefa';
            const matchType = typeLabel.toLowerCase().includes(lowerSearch);

            // Verifica o Departamento (opcional, se quiser buscar por depto tbm)
            const matchDept = model.department?.name?.toLowerCase().includes(lowerSearch);

            return matchName || matchType || matchDept;
        });
    }, [models, searchTerm]);

    return (
        <>
            <Head><title>Modelos de Tarefa - Integração</title></Head>
            <div className={styles.page}>
                <div className={styles.header}>
                    <h1 className={styles.title}>Modelos de Tarefas</h1>
                    
                    <div className={styles.headerActions}>
                        <div className={styles.searchWrap}>
                            <IoSearch className={styles.searchIcon} />
                            <input
                                type="text" 
                                placeholder="Buscar por nome ou tipo..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={styles.searchInput}
                            />
                        </div>

                        {canManageTaskModels ? (
                            <button className={styles.primaryBtn} onClick={handleOpenCreate}>
                                <IoAdd />
                                Nova Tarefa
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className={styles.card}>
                    {isLoading ? (
                        <div className={styles.loading}>Carregando...</div>
                    ) : filteredModels.length === 0 ? (
                        <p className={styles.emptyText}>
                            {searchTerm ? 'Nenhum resultado encontrado para a busca.' : 'Nenhum modelo cadastrado.'}
                        </p>
                    ) : (
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Nome</th>
                                        <th>Departamento</th>
                                        <th>Tipo</th>
                                        <th style={{ width: 100 }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                {filteredModels.map((model) => (
                                    <tr key={model.id}>
                                        <td>{model.name}</td>
                                        <td>{model.department?.name || '-'}</td>
                                        <td>
                                            <span className={model.billing === 'Realizar' ? styles.badgeBlue : styles.badgeGray}>
                                                {model.billing === 'Realizar' ? 'Produto' : 'Tarefa'}
                                            </span>
                                        </td>
                                        <td>
                                            {canManageTaskModels ? (
                                                <div className={styles.rowActions}>
                                                    <button
                                                        aria-label="Editar"
                                                        className={styles.iconBtn}
                                                        onClick={() => handleOpenEdit(model)}
                                                    >
                                                        <IoPencil />
                                                    </button>
                                                    <button
                                                        aria-label="Excluir"
                                                        className={styles.iconBtnDanger}
                                                        onClick={() => handleOpenDelete(model.id)}
                                                    >
                                                        <IoTrash />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className={styles.readonlyText}>Somente leitura</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Criação/Edição */}
            <TaskModelModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                initialData={selectedModel} 
                onSave={handleSave} 
            />

            {/* Modal de Confirmação de Exclusão (AlertDialog) */}
            {isDeleteAlertOpen && (
                <div className={styles.modalOverlay} onClick={onCloseDelete}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                        <h3 className={styles.modalTitle}>Excluir Modelo</h3>
                        <p className={styles.modalBody}>
                            Tem certeza que deseja excluir este modelo de tarefa? Essa ação não pode ser desfeita.
                        </p>
                        <div className={styles.modalFooter}>
                            <button ref={cancelRef} onClick={onCloseDelete} className={styles.ghostBtn}>
                                Cancelar
                            </button>
                            <button onClick={confirmDelete} className={styles.dangerBtn}>
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export const getServerSideProps = canSSRAdmin(async (ctx) => {
    return { props: {} };
});
