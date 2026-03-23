import Head from 'next/head';
import { Box, Flex, Text } from '@chakra-ui/react';

interface DepartmentRoutePageProps {
  title: string;
}

export function DepartmentRoutePage({ title }: DepartmentRoutePageProps) {
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <Flex direction="column" w="100%" gap={4}>
        <Box
          p={{ base: 5, md: 6 }}
          bg="linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))"
          borderRadius="2xl"
          borderWidth="1px"
          borderColor="whiteAlpha.300"
          boxShadow="0 10px 24px rgba(0,0,0,0.16)"
          backdropFilter="blur(8px)"
        >
          <Text color="primaryText" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold">
            {title}
          </Text>
          <Text color="secondaryText" mt={2}>
            Pagina do departamento {title}.
          </Text>
        </Box>
      </Flex>
    </>
  );
}
