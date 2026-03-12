import React from 'react';
import { Flex, Input, InputGroup, InputLeftElement, Menu, MenuButton, MenuItem, MenuList, Button, Box } from '@chakra-ui/react';
import { IoMdSearch, IoIosArrowForward } from 'react-icons/io';

interface OrganizationFiltersProps {
  initialStatus: string;
  onFilterChange: (status: string) => void;
  onSearchChange: (term: string) => void;
  onOpenCreateModal: () => void;
}

export function OrganizationFilters({ 
  initialStatus, 
  onFilterChange, 
  onSearchChange, 
  onOpenCreateModal 
}: OrganizationFiltersProps) {
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
      
      <Flex w="100%" flexDirection={'row'} gap={3}>
        <Menu>
          <MenuButton as={Button} w="50%" rightIcon={<IoIosArrowForward />}>
            Filtro - {initialStatus}
          </MenuButton>
          <MenuList bg='bodyBg' border={'1px solid'} borderColor={'borderColorDarkOnly'}>
            <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange('active')}>
              Ativos
            </MenuItem>
            <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange('trial')}>
              Trial
            </MenuItem>
            <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange('suspended')}>
              Suspensos
            </MenuItem>
            <MenuItem bg={'transparent'} _hover={{ bg: 'componentColor', color: 'secondaryText' }} onClick={() => onFilterChange('cancelled')}>
              Cancelados
            </MenuItem>
          </MenuList>
        </Menu>
        <Button onClick={onOpenCreateModal} w="50%" _hover={{ bg: 'componentColor', color: 'secondaryText' }}>
          Cadastrar
        </Button>
      </Flex>
    </Flex>
  );
}
