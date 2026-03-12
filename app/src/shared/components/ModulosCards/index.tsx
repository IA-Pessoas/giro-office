import React, { useState } from 'react';
import { Box, Text, Image, Link } from '@chakra-ui/react';

interface ModuleCardProps {
  name: string;
  imageUrl: string;
  link: string;
  color: string;
}

export function ModuleCard({ name, imageUrl, link, color }) {
    const [isHovered, setIsHovered] = useState(false);

  return (
    <Link href={link} _hover={{ textDecoration: 'none' }}>
      <Box
        p={4}
        boxShadow="md"
        borderRadius="md"
        cursor="pointer"
        _hover={{
          transition: '0.5s',
          textColor: 'white',
          bg: color,
          boxShadow: "lg",
          '& img': {
            filter: 'brightness(0.5)',
          },
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Image src={imageUrl} alt={name} maxW="150px" mx="auto" style={isHovered ? { filter: 'brightness(0.5)' } : {}} />
        <Text mt={4} textAlign="center" fontWeight="bold">
          {name}
        </Text>
      </Box>
    </Link>
  );
};