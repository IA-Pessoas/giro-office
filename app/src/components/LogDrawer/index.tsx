import {
    Drawer,
    DrawerOverlay,
    DrawerContent,
    DrawerHeader,
    DrawerBody,
    DrawerCloseButton,
    Button,
    useDisclosure,
    Spinner,
    Text,
    Box
} from '@chakra-ui/react'
import { useState } from 'react'
import { FiClock } from 'react-icons/fi'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale';

import { setupAPIClient } from '../../services/api'

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
    const { isOpen, onOpen, onClose } = useDisclosure()
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    const handleOpen = async () => {
        setLoading(true)
        onOpen()

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
                leftIcon={<FiClock />}
                w="auto"
                mt={3}
                mb={4}
                size="lg"
                onClick={handleOpen}
            >
                Histórico
            </Button>

            <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
                <DrawerOverlay />
                <DrawerContent>
                    <DrawerCloseButton />
                    <DrawerHeader bg={'bodyBg'}>Histórico de alterações</DrawerHeader>
                    <DrawerBody bg={'bodyBg'}>
                        {loading ? (
                            <Spinner />
                        ) : logs.length === 0 ? (
                            <Text color={'bodyText'}>Nenhuma alteração registrada.</Text>
                        ) : (
                            logs.map((log, index) => (
                                <Box key={index} mb={4} p={3} bg="componentColorReverse" borderRadius="md">
                                    <Text fontWeight="bold">{log.action}</Text>
                                    <Text fontSize="sm" color={'bodyText'}>
                                        Em: {format(new Date(log.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                    </Text>
                                    <Text fontSize="sm" color={'bodyText'}>
                                        Por: {log.user.name}
                                    </Text>
                                    <Box mt={2}>
                                        {log.action !== "Cadastro" && (
                                            Object.entries(log.changes).map(([key, value]: any) => {
                                                if (key === "photo") return null

                                                const label = fieldLabels[key] || key
                                                const from = value.from !== undefined ? formatValue(key, value.from) : "-"
                                                const to = value.to !== undefined ? formatValue(key, value.to) : "-"

                                                return (
                                                    <Text key={key} fontSize="sm" color={'bodyText'}>
                                                        <strong>{label}:</strong> De: {from} → Para: {to}
                                                    </Text>
                                                )
                                            })
                                        )}
                                    </Box>
                                </Box>
                            ))
                        )}
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    )
}
