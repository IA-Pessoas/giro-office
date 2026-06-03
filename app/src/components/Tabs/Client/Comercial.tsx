import React from "react";
import {
  Box,
  Flex,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Select,
  Button,
} from "@shared/ui/chakraShims";
import { IoCreate } from "react-icons/io5";

import LogDrawer from "@shared/components/LogDrawer";

import { useClientFormComercial } from "@modules/clients";
import type { Client, Perms } from "@modules/clients";

interface ClientTabProps {
  client: Client;
  perms: Perms;
}

export const comercialTab = ({ client, perms }: ClientTabProps) => {
  const { formData, isLoading, handleInputChange, handleUpdate } = useClientFormComercial(client);

  return (
    <Box p={4}>
      <Flex direction="column" alignItems="center" pt={4} pb={8} w="100%" maxWidth="100%" mx="auto">
        <Flex
          as="form"
          direction="column"
          w="100%"
          gap={4}
          onSubmit={(event) => {
            event.preventDefault();
            handleUpdate();
          }}
        >
          <SimpleGrid columns={{ base: 3, md: 3, lg: 3 }} gap={4}>
            <FormControl>
              <FormLabel>Status</FormLabel>
              <Select
                name="prospecting_status"
                value={formData.prospecting_status}
                onChange={handleInputChange}
                color="bodyText"
              >
                <option value="Análise/Agendamento">Análise/Agendamento</option>
                <option value="Envio de Proposta">Envio de Proposta</option>
                <option value="Análise Financeira">Análise Financeira</option>
                <option value="Fechado">Fechado</option>
                <option value="Paralisado">Paralisado</option>
                <option value="Recusado pelo Cliente">Recusado pelo Cliente</option>
                <option value="Baixada">Baixada</option>
                <option value="Inativo">Inativo</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Data do Status da Prospecção:</FormLabel>
              <Input
                name="date_status"
                type="datetime-local"
                value={formData.date_status}
                onChange={handleInputChange}
                color="bodyText"
              />
            </FormControl>
            <FormControl>
              <FormLabel>Descrição da Prospecção:</FormLabel>
              <Input
                name="description_prospecting"
                value={formData.description_prospecting}
                onChange={handleInputChange}
                color="bodyText"
              />
            </FormControl>
          </SimpleGrid>

          <Flex mt={6} justify="space-between" align="center">
            <LogDrawer referring="clients" referringId={client.id} />
            <Button
              type="submit"
              leftIcon={<IoCreate />}
              size="lg"
              bg="componentColor"
              color="white"
              isLoading={isLoading}
              _hover={{ bg: "componentColorReverse" }}
            >
              Salvar Alterações
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  );
};
