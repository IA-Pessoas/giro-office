import { extendTheme, ThemeConfig } from '@chakra-ui/react';

const getInitialColorMode = (): "light" | "dark" | "system" => {
  if (typeof window !== "undefined") {
    const storedMode = localStorage.getItem("chakra-ui-color-mode");
    if (storedMode === "light" || storedMode === "dark" || storedMode === "system") {
      return storedMode;
    }
  }
  return "light"; 
};

const colors = {
  main: {
    main: '#2f406a',
    mainDourado: '#d0ab70',
    subDourado: '#ffd189',
    body: '#fafafa',
    subText: '#ffffffb3',
    divisor: '#676767',
    divisorOp: '#67676726',
    transparent: '#0000000',
    mainOpacity: '#2f406a4d',
    mainDouradoOpacity: '#d0ab704d',
  },
  colors: {
    yellow: '#ECC94B',
    green: '#48BB78',
    grey: '#A0AEC0'
  },
  tecnologia: {
    main: '#823382',
    sub: '#cc00cc',
  },
  integracao: {
    main: '#ef5a8b',
    sub: '#c3476f',
  },
  button: {
    main: '#d9d9d9',
    sub: '#f1f1f1',
    cta: '#a0a0a0',
    default: '#fff',
    gray: '#dfdfdf',
    danger: '#ff4040',
  },
};

const config: ThemeConfig = {
  initialColorMode: getInitialColorMode(),
  useSystemColorMode: false,
};

const theme = extendTheme({ 
  colors, 
  config,

  semanticTokens: {
    colors: {
      bodyBg: {
        _light: '#fafafa',
        _dark: '#010e30ff', 
      },
      primaryText: {
        _light: colors.main.main,
        _dark: colors.main.mainDourado,
      },
      secondaryText: {
        _light: colors.main.mainDourado,
        _dark: colors.main.main,
      },
      bodyText: {
        _light: '#010e30ff',
        _dark: '#fafafa', 
      },
      borderColor: {
        _light: colors.main.main,
        _dark: colors.main.mainDourado,
      },
      borderColorReverse: {
        _light: colors.main.mainDourado,
        _dark: colors.main.mainDourado, 
      },
      borderColorDarkOnly: {
        _light: '#fafafa',
        _dark: colors.main.mainDourado, 
      },
      mainOpacity: {
        _light: colors.main.mainOpacity,
        _dark: colors.main.mainDouradoOpacity,
      },
      mainOpacityReverse: {
        _light: colors.main.mainDouradoOpacity,
        _dark: colors.main.mainOpacity,
      },
      componentColor: {
        _light: colors.main.main,
        _dark: colors.main.mainDourado, 
      },
      componentColorReverse: {
        _light: colors.main.mainDourado,
        _dark: colors.main.main, 
      },
      componentColorDarkOnly: {
        _light: '#fafafa',
        _dark: colors.main.main, 
      },
      componentBg: {
        _light: '#fafafa',
        _dark: '#010e30ff', 
      },
      shadow: {
        _light: 'rgba(0,0,0,0.5)',
        _dark: 'rgba(255,255,255,0.5)', 
      }
    },
  },

  styles: {
    global: (props) => ({ // Usar uma função aqui é uma boa prática
      body: {
        bg: 'bodyBg',
        color: 'bodyText', // Troquei para bodyText que parece mais apropriado para o texto geral
      },
      a: {
        color: 'primaryText',
      },
      '*': {
        'scrollbarWidth': 'thin',
        'scrollbarColor': 'var(--chakra-colors-borderColorReverse) transparent',

        '&::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'var(--chakra-colors-borderColorReverse)',
          borderRadius: '24px',
          border: '2px solid var(--chakra-colors-bodyBg)' // Adiciona um respiro em volta do thumb
        },
      },
    }),
  },
});

export default theme;
