import { useState, useEffect } from 'react'; // Importar hooks
import Image from "next/image";
import { useRouter } from "next/router";
import { Link as ChakraLink, Box, IconButton, Text, Tooltip, VStack, HStack, Flex, Icon, Divider } from "@shared/ui/chakraShims";
import { IconType } from "react-icons";
import { FiHome, FiUser, FiUsers, FiLogOut, FiSettings, FiBriefcase, FiChevronRight } from "react-icons/fi";
import { FiMessageSquare } from "react-icons/fi";
import { useChat } from "@modules/chat";
import { useAuth } from "../../../context/AuthContext";
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

function NavItem({ item, isActive, currentPath, isExpanded }: { item: NavItemProps; isActive: boolean; currentPath: string; isExpanded: boolean }) {
  const isParentActive = isActive || item.subItems?.some((sub) => currentPath.startsWith(sub.link));
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(Boolean(isParentActive));

  useEffect(() => {
    setIsSubMenuOpen(Boolean(isParentActive));
  }, [isParentActive]);

  return (
    <Box>
      <ChakraLink
        href={item.link}
        aria-expanded={item.subItems?.length ? isSubMenuOpen : undefined}
        aria-controls={item.subItems?.length ? `submenu-${item.label.toLowerCase()}` : undefined}
        _hover={{ textDecoration: 'none' }}
        onClick={(e) => {
          if (item.subItems?.length) {
            e.preventDefault();
            setIsSubMenuOpen((prev) => !prev);
          }
        }}
      >
        <HStack
          w="full"
          p={1}
          mx={2}
          my={1}
          borderRadius="md"
          cursor="pointer"
          transition="all 0.2s ease"
          bg={isParentActive ? "borderColor" : "transparent"}
          color={isParentActive ? "componentColorReverse" : "componentColor"}
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
          opacity={isExpanded ? 1 : 0}
          w={isExpanded ? 'auto' : 0}
          pointerEvents={isExpanded ? 'auto' : 'none'}
            transition="opacity 0.2s ease-in-out"
          ml={isExpanded ? 2 : 0}
          >
            {item.label}
          </Text>
        </HStack>
      </ChakraLink>
      {item.subItems?.length ? (
        <VStack
          id={`submenu-${item.label.toLowerCase()}`}
          align="stretch"
          spacing={1.5}
          mt={1}
          ml={7}
          mr={3}
          className={`overflow-hidden transition-all duration-200 ease-in-out ${isSubMenuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}
        >
          {item.subItems.map((sub) => (
            <ChakraLink
              key={sub.link}
              href={sub.link}
              w="full"
              display="block"
              fontSize="sm"
              borderRadius="lg"
              px={2.5}
              py={1.5}
              borderWidth="0px"
              bg={currentPath === sub.link ? "borderColor" : "transparent"}
              color={currentPath === sub.link ? "componentColorReverse" : "componentColor"}
              boxShadow="none"
              transition="all 0.2s ease"
              _hover={{
                bg: "borderColorReverse",
                color: "white",
                textDecoration: "none",
                transform: "translateX(2px)",
              }}
              _focusVisible={{
                outline: "2px solid var(--colors-blue-500)",
                outlineOffset: "1px",
              }}
              aria-current={currentPath === sub.link ? "page" : undefined}
            >
              <HStack spacing={1.5}>
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
function NavItemAction({ label, icon, onClick, children = null, isExpanded = false }) {
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
        opacity={isExpanded ? 1 : 0}
        w={isExpanded ? 'auto' : 0}
        pointerEvents={isExpanded ? 'auto' : 'none'}
        transition="opacity 0.2s ease-in-out" // Ajustado para ficar igual ao NavItem padrão
        ml={isExpanded ? 2 : 0}
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
  const [isExpanded, setIsExpanded] = useState(false);

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

  useEffect(() => {
    const root = document.documentElement;
    const current =
      root.classList.contains("dark") || root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    root.setAttribute("data-theme", next);
    localStorage.setItem("workspace-theme", next);
    localStorage.setItem("chakra-ui-color-mode", next);
  };

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

  const navLinks = filteredNavItems.map((item) => (
    <NavItem
      key={item.link}
      item={item}
      isActive={router.pathname === item.link || item.subItems?.some((sub) => sub.link === router.pathname) === true}
      currentPath={router.asPath}
      isExpanded={isExpanded}
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
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      style={{
        width: typeof window !== 'undefined' && window.innerWidth >= 768 ? (isExpanded ? "240px" : "80px") : undefined,
        transition: "width 0.28s ease-in-out, box-shadow 0.2s ease-in-out",
        willChange: "width",
      }}
      transition="all 0.2s ease-in-out"
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
        justifyContent="flex-start"
      >
        <Box w="full" pt={0}>
          <Flex justifyContent="center" px={2}>
            <Flex
              align="center"
              direction="row"
              w={isExpanded ? "full" : "auto"}
              h="96px"
              px={2}
              py={0}
              my={0}
              mt={0}
              borderRadius="md"
              _hover={{ textDecoration: 'none' }}
              justifyContent="center"
            >
              <Box
                w="80px"
                h="80px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <Image
                  src={`/logos/lions/Castelo.webp`}
                  alt="Logo da Castelo"
                  width={65}
                  height={65}
                  style={{ objectFit: 'contain' }}
                />
              </Box>

              <Text
                fontSize="md"
                fontWeight="medium"
                whiteSpace="nowrap"
                lineHeight="1"
                opacity={isExpanded ? 1 : 0}
                w={isExpanded ? "auto" : 0}
                pointerEvents={isExpanded ? "auto" : "none"}
                ml={isExpanded ? 3 : 0}
                mt={0}
                transition="opacity 0.18s ease-in-out, width 0.18s ease-in-out, margin 0.18s ease-in-out"
                color={theme === "dark" ? "borderColorReverse" : "primaryText"}
                textAlign="center"
                style={{ whiteSpace: 'nowrap' }}
              >
                Castelo Workspace
              </Text>
            </Flex>
          </Flex>
          <Divider borderColor="borderColor" opacity={.5} my={2} />
        </Box>

        <VStack
          spacing={2}
          align="stretch"
          w="full"
          mt={3}
          overflowY="visible"
          overflowX="hidden"
        >
          {navLinks}
        </VStack>

        <Box w="full" pb={2}>
          <Divider borderColor="borderColor" opacity={.5} my={6} />
          <NavItemAction
            label="Chat"
            icon={FiMessageSquare}
            onClick={onChatOpen}
            isExpanded={isExpanded}
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
            isExpanded={isExpanded}
          />
          <Divider borderColor="borderColor" opacity={.5} my={4} />
          <NavItemAction
            label="Sair"
            icon={FiLogOut}
            onClick={logoutUser}
            isExpanded={isExpanded}
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