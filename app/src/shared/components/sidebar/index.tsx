import { useState, useEffect } from 'react'; // Importar hooks
import Image from "next/image";
import { useRouter } from "next/router";
import { Link as ChakraLink, Box, IconButton, useColorMode, Text, Tooltip, VStack, HStack, Flex, Icon, Divider } from "@chakra-ui/react";
import { IconType } from "react-icons";
import { FiHome, FiUser, FiUsers, FiLogOut, FiSettings, FiBriefcase, FiChevronRight } from "react-icons/fi";
import { FiMessageSquare } from "react-icons/fi";
import { useChat } from "@modules/chat";
import { useAuth } from "../../../context/AuthContext";
import { MoonIcon, SunIcon } from "@chakra-ui/icons";
import { setupAPIClient } from '@shared/services/api';

// Dados estáticos fora do componente
interface NavItemProps {
  label: string;
  link: string;
  icon: IconType;
  requiredPermission: number; // Permissão Geral
  permissionKey?: string;     // Chave específica (ex: 'integracao')
  minLevel?: number;          // Nível mínimo específico
  subItems?: Array<{ label: string; link: string }>;
}

interface NavbarProps {
  modulo: string;
  cargo: number;
  onChatOpen: () => void;
}

const navItensPorModulo: Record<string, NavItemProps[]> = {
  castelo: [
    { label: "Dashboard", link: "/dashboard", icon: FiHome, requiredPermission: 0 },
    { label: "Usuários", link: "/users", icon: FiUser, requiredPermission: 0 },
    {
      label: "Departamentos",
      link: "/triagem",
      icon: FiUsers,
      requiredPermission: 0,
      subItems: [
        { label: "Triagem", link: "/triagem" },
        { label: "Contabil", link: "/contabil" },
        { label: "Fiscal", link: "/fiscal" },
        { label: "Regularize", link: "/regularize" },
        { label: "RH", link: "/rh" },
      ],
    },
    { label: "Clientes", link: "/clients", icon: FiUsers, requiredPermission: 0 },
    { label: "Organização", link: "/organizations", icon: FiBriefcase, requiredPermission: 0 },
    { 
      label: "Configurações", 
      link: "/configs/integracao", 
      icon: FiSettings, 
      requiredPermission: 0, 
      permissionKey: 'integracao', 
      minLevel: 2 
    },
  ],
};

function NavItem({ item, isActive, currentPath }: { item: NavItemProps; isActive: boolean; currentPath: string }) {
  return (
    <Box>
      <ChakraLink
        href={item.link}
        aria-expanded={item.subItems?.length ? isActive : undefined}
        _hover={{ textDecoration: 'none' }}
      >
        <HStack
          w="full"
          p={1}
          mx={2}
          my={1}
          borderRadius="md"
          cursor="pointer"
          transition="all 0.2s ease"
          bg={isActive ? "borderColor" : "transparent"}
          color={isActive ? "componentColorReverse" : "componentColor"}
          _hover={{
            bg: "borderColorReverse",
            color: "white",
          }}
        >
          <IconButton
            aria-label={item.label}
            icon={<item.icon size="22px" />}
            variant="unstyled"
            color="currentColor"
            isRound
            display="flex"
          />
          <Text
            fontSize="md"
            fontWeight="medium"
            opacity={0}
            w={0}
            pointerEvents="none"
            transition="opacity 0.2s ease-in-out"
            _groupHover={{
              opacity: 1,
              w: 'auto',
              pointerEvents: 'auto',
              ml: 2,
            }}
          >
            {item.label}
          </Text>
        </HStack>
      </ChakraLink>
      {item.subItems?.length ? (
        <VStack
          className="ml-12 mr-3 mt-1 max-h-0 items-stretch gap-1.5 overflow-hidden opacity-0 transition-all duration-200 ease-in-out group-hover:max-h-80 group-hover:opacity-100"
        >
          {item.subItems.map((sub) => (
            <ChakraLink
              key={sub.link}
              href={sub.link}
              className={`rounded-lg border px-2.5 py-1.5 text-sm shadow-sm transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--colors-blue-500)] ${currentPath === sub.link ? "border-[var(--colors-blue-500)] bg-[var(--colors-blue-500)] text-white" : "border-transparent bg-white/10 text-[var(--colors-blue-500)] hover:translate-x-0.5 hover:bg-[var(--colors-blue-500)] hover:text-white"}`}
              aria-current={currentPath === sub.link ? "page" : undefined}
              _hover={{ textDecoration: "none" }}
            >
              <HStack className="gap-1.5">
                <Icon as={FiChevronRight} boxSize={3} opacity={0.8} />
                <Text>{sub.label}</Text>
              </HStack>
            </ChakraLink>
          ))}
        </VStack>
      ) : null}
    </Box>
  );
}
function NavItemAction({ label, icon, onClick, children = null }) {
  return (
    <HStack
      w="full"
      p={1}
      mx={2}
      my={1}
      borderRadius="md"
      position="relative"
      cursor="pointer"
      transition="all 0.2s ease"
      color="componentColor"
      onClick={onClick} // Movemos o clique para o container inteiro
      _hover={{
        bg: "borderColorReverse",
        color: "white",
      }}
    >
      <Tooltip label={label} placement="right" hasArrow>
        <IconButton
          aria-label={label}
          icon={<Icon as={icon} boxSize="22px" />}
          // onClick={onClick} // Removido daqui
          variant="unstyled"
          color="currentColor"
          isRound
          display="flex"
          // Removidos w="full", justifyContent="start" e pl={3} que causavam o desalinhamento
        />
      </Tooltip>
      <Text
        fontSize="md"
        fontWeight="medium"
        opacity={0}
        w={0}
        pointerEvents="none"
        transition="opacity 0.2s ease-in-out" // Ajustado para ficar igual ao NavItem padrão
        _groupHover={{
          opacity: 1,
          w: 'auto',
          pointerEvents: 'auto',
          ml: 2,
        }}
      >
        {label}
      </Text>
      {children}
    </HStack>
  );
}

export default function Navbar({ modulo, cargo, onChatOpen }: NavbarProps) {
  const router = useRouter();
  const { logoutUser } = useAuth();
  const [perms, setPerms] = useState<any>(null);

  useEffect(() => {
    async function fetchPerms() {
      try {
        const apiClient = setupAPIClient();
        const response = await apiClient.get('/permission');
        console.log(response)
        setPerms(response.data.permission);
      } catch (err) {
        console.error("Erro ao buscar permissões na sidebar", err);
      }
    }
    fetchPerms();
  }, []);

  const navItems = navItensPorModulo[modulo] || [];
  const filteredNavItems = navItems.filter(item => {
    // 1. Verifica permissão geral (cargo)
    if (item.requiredPermission > cargo) return false;

    // 2. Verifica permissão específica (se o item exigir)
    if (item.permissionKey && item.minLevel !== undefined) {
      // Se ainda não carregou as perms, esconde por segurança
      if (!perms) return false;

      const userLevel = perms[item.permissionKey];
      if (userLevel < item.minLevel) return false;
    }

    return true;
  });
  
  const { totalUnreadCount } = useChat();

  const { colorMode, toggleColorMode } = useColorMode();

  const navLinks = filteredNavItems.map((item) => (
    <NavItem
      key={item.link}
      item={item}
      isActive={router.pathname === item.link || item.subItems?.some((sub) => sub.link === router.pathname) === true}
      currentPath={router.asPath}
    />
  ));

  return (
    <Flex
      as="nav"
      role="group"
      position="fixed"
      zIndex="999"
      bg={'bodyBg'}
      boxShadow="lg"
      direction={{ base: "row", md: "column" }}
      justifyContent={{ base: "space-around", md: "flex-start" }}
      alignItems="center"
      pt={{ base: 0, md: 4 }}
      bottom={{ base: 0, md: "auto" }}
      top={{ base: "auto", md: 0 }}
      left={0}
      right={{ base: 0, md: "auto" }}
      h={{ base: "60px", md: "100vh" }}
      w={{ base: "100%", md: "80px" }}
      _hover={{
        w: { md: "240px" },
      }}
      transition="width 0.3s ease-in-out"
      _groupHover={{ opacity: 1, pointerEvents: 'auto' }}
      whiteSpace="nowrap"
      overflow="hidden"
      overflowX={{ base: "auto", md: "hidden" }}
      borderRightRadius={"10px"}
    >
      <VStack
        w="full"
        h="full"
        display={{ base: "none", md: "flex" }}
        justifyContent="space-between"
      >
        <Box w="full" pt={0}>
          <Flex>
            <Flex
              align="center"
              w="full"
              h="60px"
              px={3}
              mx={2}
              my={1}
              borderRadius="md"
              _hover={{ textDecoration: 'none' }}
            >
              <Flex
                w="55px"
                h="full"
                align="center"
                justify="center"
                flexShrink={0}
              >
                <Image
                  src={`/logos/lions/Castelo.webp`}
                  alt="Logo da Castelo"
                  width={125}
                  height={25}
                  style={{ objectFit: 'contain' }}
                />
              </Flex>

              <Text
                fontSize="md"
                fontWeight="medium"
                opacity={0}
                w={0}
                pointerEvents="none"
                transition="opacity 0.2s 0.1s ease, width 0.2s 0.1s ease" // Adiciona um pequeno delay
                _groupHover={{
                  opacity: 1,
                  w: 'auto',
                  pointerEvents: 'auto',
                  ml: 2,
                }}
              >
                Castelo Workspace
              </Text>
            </Flex>
          </Flex>
          <Divider borderColor="borderColor" opacity={.5} my={4} />
        </Box>

        <VStack
          spacing={2}
          align="stretch"
          w="full"
          flexGrow={1} 
          overflowY="auto"
          overflowX="hidden"
        >
          {navLinks}
        </VStack>

        <Box w="full" pb={4}>
          <Divider borderColor="borderColor" opacity={.5} my={4} />
          <NavItemAction
            label="Chat"
            icon={FiMessageSquare}
            onClick={onChatOpen}
          >
            {totalUnreadCount > 0 && (
              <Flex
                as="span"
                position="absolute"
                top="8px"
                right="8px"
                fontSize="10px"
                fontWeight="bold"
                color="white"
                bg="red.500"
                borderRadius="full"
                boxSize="20px"
                alignItems="center"
                justifyContent="center"
                border="2px solid"
                borderColor={'transparent'}
              >
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </Flex>
            )}
          </NavItemAction>
          <NavItemAction
            label={colorMode === 'light' ? 'Modo Escuro' : 'Modo Claro'}
            icon={colorMode === 'light' ? MoonIcon : SunIcon}
            onClick={toggleColorMode}
          />
          <Divider borderColor="borderColor" opacity={.5} my={4} />
          <NavItemAction
            label="Sair"
            icon={FiLogOut}
            onClick={logoutUser}
          />
        </Box>
      </VStack>

      <HStack
        w="full"
        h="full"
        display={{ base: "flex", md: "none" }}
        justifyContent="flex-start"
        alignItems="center"
        spacing={4}
        px={4}
        overflowX="auto"
        flexGrow={1}
      >
        {navLinks}
      </HStack>
    </Flex>
  );
}