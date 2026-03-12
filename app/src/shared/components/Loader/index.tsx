// Loader.tsx
import { Box, useBreakpointValue } from '@chakra-ui/react';
import { CSSProperties } from 'react';

const Loader = () => {
    const isSmallScreen = useBreakpointValue({ base: true, md: false }); // Responsividade

    const imageStyle: CSSProperties = {
        animation: 'blink 1.5s ease-in-out infinite',
    };

    return (
        <Box
            position="absolute" // antes era fixed
            top={0}
            left={0}
            right={0}
            bottom={0}
            zIndex={10}
            display="flex"
            justifyContent="center"
            alignItems="center"
        >
            <Box
                borderRadius="full"
                overflow="hidden"
                width={isSmallScreen ? "60px" : "100px"}
                height={isSmallScreen ? "60px" : "100px"}
            >
                <img
                    src={`/logos/lions/Castelo.webp`}
                    alt="Loading"
                    style={imageStyle}
                />
            </Box>
        </Box>

    );
};

export default Loader;
