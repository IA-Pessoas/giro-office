import { useState } from 'react'
import { FiClock } from 'react-icons/fi'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale';
import styles from './LogDrawer.module.css'

import { setupAPIClient } from '@shared/services/api'

interface LogDrawerProps {
    referring: string
    referringId: string
}

const fieldLabels: Record<string, string> = {
    department_id: "Departamento",
    name: "Nome",
    permission: "Permissão",
    status: "Status",
    color: "Cor",
    solution: "Solução",
}

const permissionMap: Record<number, string> = {
    0: "Padrão",
    1: "Sub Administrador",
    2: "Administrador",
}

export default function LogDrawer({ referring, referringId }: LogDrawerProps) {
    const apiClient = setupAPIClient()
    const [isOpen, setIsOpen] = useState(false)
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    const handleOpen = async () => {
        setLoading(true)
        setIsOpen(true)

        try {
            const response = await apiClient.get('/logs', {
                params: { referring, referringId }
            })
            setLogs(response.data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const formatValue = (key: string, val: any) => {
        if (key === 'permission') return permissionMap[val] ?? val
        return val
    }

    return (
        <>
            <Button
            <button className={styles.trigger} onClick={handleOpen}>
                <FiClock />
                Histórico
            </button>

            {isOpen && (
                <div className={styles.overlay} onClick={() => setIsOpen(false)}>
                    <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeBtn} onClick={() => setIsOpen(false)} aria-label="Fechar histórico">
                            x
                        </button>
                        <div className={styles.header}>Histórico de alterações</div>
                        <div className={styles.body}>
                        {loading ? (
                            <div className={styles.spinner}>Carregando...</div>
                        ) : logs.length === 0 ? (
                            <p className={styles.text}>Nenhuma alteração registrada.</p>
                        ) : (
                            logs.map((log, index) => (
                                <div key={index} className={styles.logCard}>
                                    <p className={styles.logTitle}>{log.action}</p>
                                    <p className={styles.text}>
                                        Em: {format(new Date(log.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                    </p>
                                    <p className={styles.text}>
                                        Por: {log.user.name}
                                    </p>
                                    <div className={styles.changes}>
                                        {log.action !== "Cadastro" && (
                                            Object.entries(log.changes).map(([key, value]: any) => {
                                                if (key === "photo") return null

                                                const label = fieldLabels[key] || key
                                                const from = value.from !== undefined ? formatValue(key, value.from) : "-"
                                                const to = value.to !== undefined ? formatValue(key, value.to) : "-"

                                                return (
                                                    <p key={key} className={styles.text}>
                                                        <strong>{label}:</strong> De: {from} → Para: {to}
                                                    </p>
                                                )
                                            })
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                        </div>
                    </aside>
                </div>
            )}
        </>
    )
}
