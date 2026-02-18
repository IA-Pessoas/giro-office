import React from 'react';
import { Button, Icon, Link } from '@chakra-ui/react';
import { FaSpinner } from 'react-icons/fa';
import { MdOutlineMotionPhotosPause } from "react-icons/md";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";

import { IconType } from 'react-icons';

interface ActionButtonProps {
  icon: IconType
  href?: string
  onClick?: () => void
  children: React.ReactNode
  status?: string
}

export const ActionButton = ({ icon, href, onClick, children, status }: ActionButtonProps) => {
  let DefaultIcon = icon;
  let DefaultColor = 'mainOpacity';

  const statusIconMap: Record<string, IconType> = {
    'Em andamento': FaSpinner,
    'Concluído': IoMdCheckmarkCircleOutline,
    'Paralisado': MdOutlineMotionPhotosPause,
  };
  const statusColorMap: Record<string, string> = {
    'Em andamento': 'colors.yellow',
    'Concluído': 'colors.green',
    'Paralisado': 'colors.grey',
  };

  DefaultIcon = statusIconMap[status] || DefaultIcon;
  DefaultColor = statusColorMap[status] || DefaultColor;
  
  const button = (
    <Button
      leftIcon={<Icon as={DefaultIcon} boxSize={5} />}
      variant="outline"
      color={DefaultColor}
      border={'1px solid'}
      borderColor={DefaultColor}
      justifyContent="flex-start"
      onClick={onClick}
    >
      {children}
    </Button>
  );

  if (href) {
    return (
      <Link href={href} _hover={{ textDecoration: 'none' }}>
        {button}
      </Link>
    );
  }

  return button;
};