import React from 'react';
import { Grid, GridItem, Text } from '@chakra-ui/react';

interface DataRowProps {
  label: string;
  children: React.ReactNode;
}

export const DataRow = ({ label, children }: DataRowProps) => {
  return (
    <Grid
      templateColumns={{ base: '1fr', md: '1fr 2fr' }}
      p={3}
      border={"1px solid"}
      borderColor={'transparent'}
      borderBottomColor={"mainOpacity"}
      borderRadius={0}
      alignItems="center"
      transition={'all 0.3s ease-in-out'}
      _hover={{
        border: '1px solid',
        borderColor: 'mainOpacity',
        borderRadius: '5px'
      }}
    >
      <GridItem>
        <Text fontWeight="bold" color={'primaryText'}>
          {label}
        </Text>
      </GridItem>
      <GridItem>
        <Text color={'bodyText'}>{children}</Text>
      </GridItem>
    </Grid>
  );
};