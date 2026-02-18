// src/components/layout/ChatControllerUI.tsx

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ChatOverlay } from '../Chat/ChatOverlay';

interface ChatControllerUIProps {
  isOpen: boolean;
  onClose: () => void;
}

// O componente agora recebe 'isOpen' e 'onClose' como props
export const ChatControllerUI = ({ isOpen, onClose }: ChatControllerUIProps) => {
  const { isAuthenticated } = useAuth();

  // Removemos o useState daqui de dentro

  if (!isAuthenticated) {
    return null;
  }

  // O ícone flutuante não é mais renderizado aqui
  // Apenas o overlay, controlado pela prop 'isOpen'
  return (
    <ChatOverlay isOpen={isOpen} onClose={onClose} />
  );
};