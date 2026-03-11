import React from 'react';
import { Flex, Input, InputGroup, InputLeftElement, Menu, MenuButton, MenuItem, MenuList, Button, Box, MenuOptionGroup, MenuDivider } from '@chakra-ui/react';
import { IoMdSearch, IoIosArrowForward } from 'react-icons/io';
import { CiCirclePlus } from "react-icons/ci";

import type { Perms } from '../types';

interface FiltersProps {
  initialLabel: string;
  perm: Perms;
  onFilterChange: (filters: { status: string; ref?: string; label?: string }) => void;
  onSearchChange: (term: string) => void;
  onOpenCreateModal: () => void;
}

export function ClientFilters({ initialLabel, perm, onFilterChange, onSearchChange, onOpenCreateModal }: FiltersProps) {
  return (
    <Flex direction={'column'} w="100%" gap={3} p={2}>
      <InputGroup>
        <InputLeftElement pointerEvents='none'>
          <Box color='primaryText'>
            <IoMdSearch />
          </Box>
        </InputLeftElement>
        <Input
          type="text"
          bg='componentBg'
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder='Buscar por nome...'
          _placeholder={{ color: 'primaryText' }}
        />
      </InputGroup>
      
      <Flex w="100%" flexDirection={'row'} gap={3} overflow={'none'}>
        <Menu>
          <MenuButton as={Button} w="90%" rightIcon={<IoIosArrowForward />} isTruncated>
            <Box as="span" isTruncated>
              Filtro: {initialLabel}
            </Box>
          </MenuButton>
          <MenuList zIndex={10} bg='bodyBg' border={'1px solid'} borderColor={'borderColor'} overflowY={'scroll'} boxShadow={'0 0 10px var(--chakra-colors-shadow)'} maxH={'50vh'}>
            <MenuOptionGroup title='Status' sx={{ '& > p': { fontWeight: 'bold', paddingX: '0.75rem', fontSize: 'sm', color: 'primaryText' } }}>
              <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Ativo', label: 'Ativo' })}>Ativos</MenuItem>
              <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Inativo', label: 'Inativo' })}>Inativos</MenuItem>
            </MenuOptionGroup>
            {perm.integracao === 2 && (
              <>
                <MenuDivider />
                <MenuOptionGroup title='Integração' sx={{ '& > p': { fontWeight: 'bold', paddingX: '0.75rem', fontSize: 'sm', color: 'primaryText' } }}>
                  <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Ativo e Prospecção', label: 'Ativos e em Prospecção' })}>Ativos e em Prospecçãos</MenuItem>
                  <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Ativo PJ', label: 'Ativo PJ' })}>Ativos PJ</MenuItem>
                  <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Ativo PF', label: 'Ativo PF' })}>Ativos PF</MenuItem>
                  <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Prospecção PJ', label: 'Prospecção PJ' })}>Prospecção PJ</MenuItem>
                  <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Prospecção PF', label: 'Prospecção PF' })}>Prospecção PF</MenuItem>
                  <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Não Contradado e Paralisado', label: 'Não Contratados e Paralisados' })}>Não Contratados e Paralisados</MenuItem>
                  <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Inativo PJ', label: 'Inativo PJ' })}>Inativo PJ</MenuItem>
                  <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Inativo PF', label: 'Inativo PF' })}>Inativo PF</MenuItem>
                </MenuOptionGroup>
              </>
            )}
            {(perm.contabil !== null || perm.fiscal !== null || perm.pessoal !== null) && (
              <>
                <MenuDivider />
                <MenuOptionGroup title='Clientes por Departamento' sx={{ '& > p': { fontWeight: 'bold', paddingX: '0.75rem', fontSize: 'sm', color: 'primaryText' } }}>
                  {perm.contabil !== null && (
                    <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Ativo', label: 'Dep Contábil' })}>Dep Contábil</MenuItem>
                  )}
                  {perm.fiscal !== null && (
                    <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Ativo', label: 'Dep Fiscal' })}>Dep Fiscal</MenuItem>
                  )}
                  {perm.pessoal !== null && (
                    <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange({ status: 'Ativo', label: 'Dep Pessoal' })}>Dep Pessoal</MenuItem>
                  )}
                </MenuOptionGroup>
              </>
            )}
          </MenuList>
        </Menu>
        <Menu>
          <MenuButton as={Button} w="5%" _hover={{ bg: 'componentColor', color: 'secondaryText' }}>
            <CiCirclePlus size={30} />
          </MenuButton>
          <MenuList zIndex={10}>
            {perm.integracao === 2 && (
              <MenuItem onClick={() => onOpenCreateModal()}>Novo Cliente (Integração)</MenuItem>
            )}
          </MenuList>
        </Menu>
      </Flex>
    </Flex>
  );
}