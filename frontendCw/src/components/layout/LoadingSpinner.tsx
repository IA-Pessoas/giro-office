import React from 'react';
import { Flex, Spinner } from '@chakra-ui/react';

export const LoadingSpinner = () => {
  return (
    <Flex justify="center" align="center" p={10}>
      <Spinner
        thickness="4px"
        speed="0.5s"
        emptyColor="componentColorReverse"
        color="componentColor"
        size="xl"
      />
    </Flex>
  );
};