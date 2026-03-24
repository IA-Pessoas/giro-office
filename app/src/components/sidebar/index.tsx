import { useState, useEffect } from 'react'; // Importar hooks
import Image from "next/image";
import { useRouter } from "next/router";
import { Link as ChakraLink, Box, IconButton, Text, Tooltip, VStack, HStack, Flex, Icon, Divider } from "@chakra-ui/react";
import { IconType } from "react-icons";
import { FiHome, FiUser, FiUsers, FiLogOut, FiSettings } from "react-icons/fi";
import { FiMessageSquare } from "react-icons/fi";
import { useChat } from "../../context/ChatContext";
import { useAuth } from "../../context/AuthContext";
import { FiMoon, FiSun } from "react-icons/fi";
import { setupAPIClient } from '@shared/services/api';

// Dados estáticos fora do componente
interface NavItemProps {
  label: string;
  link: string;
  icon: IconType;
  requiredPermission: number; // Permissão Geral
  permissionKey?: string;     // Chave específica (ex: 'integracao')
  minLevel?: number;          // Nível mínimo específico
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
    { label: "Departamentos", link: "/departments", icon: FiUsers, requiredPermission: 0 },
    { label: "Clientes", link: "/clients", icon: FiUsers, requiredPermission: 0 },
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

function NavItem({ item, isActive }: { item: NavItemProps; isActive: boolean }) {
  return (
    <ChakraLink href={item.link} _hover={{ textDecoration: 'none' }}>
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
  const [theme, setTheme] = useState<"light" | "dark">("light");

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

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("chakra-ui-color-mode", next);
  };

  const navLinks = filteredNavItems.map((item) => (
    <NavItem
      key={item.link}
      item={item}
      isActive={router.pathname === item.link}
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
            label={theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}
            icon={theme === 'light' ? FiMoon : FiSun}
            onClick={toggleTheme}
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