import React from 'react';
import Link from 'next/link';
import { FaSpinner } from 'react-icons/fa';
import { MdOutlineMotionPhotosPause } from "react-icons/md";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { IconType } from 'react-icons';
import styles from './ActionButton.module.css';


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
    <button
      type="button"
      className={styles.button}
      data-color={DefaultColor}
      onClick={onClick}
    >
      <DefaultIcon className={styles.icon} />
      <span>{children}</span>
    </button>
  );

  if (href) {
    return (
      <Link href={href} className={styles.link}>
        {button}
      </Link>
    );
  }

  return button;
};