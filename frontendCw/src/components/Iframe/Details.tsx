import React, { useState, useEffect } from 'react';
import { Box, Text, } from '@chakra-ui/react';
import Loader from '../Loader';

interface DetailsViewProps {
  id: string | null;
  link: string;
}

export function DetailsView({ id, link }: DetailsViewProps) {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (id) {
      setIsLoading(true);
    }
  }, [id]);

  const handleIframeLoad = () => {
    setTimeout(() => setIsLoading(false), 300);
  };

  if (!id) {
    return (
      <Box w="100%" h="90vh" display="flex" alignItems="center" justifyContent="center">
        <Text color="main.main">Selecione para ver os detalhes...</Text>
      </Box>
    );
  }

  const iframeSrc = `/${link}/${id}?view=iframe`;

  return (
    <Box 
      w="100%" 
      h="90vh" 
      ml={2}
      position="relative"
      borderRadius={'8px'}
      border={'1px solid'}
      borderColor={'borderColorDarkOnly'}
      shadow={'md'}
    >
      {isLoading && <Loader />}

      <iframe
        key={id}
        src={iframeSrc}
        width="100%"
        height="100%"
        style={{
          border: 'none',
          borderRadius: '8px',
          display: isLoading ? 'none' : 'block',
        }}
        onLoad={handleIframeLoad}
      />
    </Box>
  );
}