// src/components/Chat/ChatOverlay.tsx
import React from 'react';
import { ChatProvider } from '../../../context/ChatContext';
import { ChatLayout } from './ChatLayout';
import { IoMdCloseCircleOutline } from "react-icons/io";

import * as styles from '../../../styles/chat'

interface ChatOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ChatOverlay = ({ isOpen, onClose }: ChatOverlayProps) => {
    if (!isOpen) {
        return null;
    }

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(5px)',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: 'clamp(320px, 90vw, 1400px)',
                    height: 'clamp(400px, 90vh, 1000px)',
                    background: 'var(--colors-body-bg, #fff)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.01)',
                }}
            >
                <button onClick={onClose} style={{
                    position: 'fixed', 
                    top: '10px',
                    right: '10px', 
                    zIndex: 1001,
                    background: 'transparent',
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '50%',
                    width: '30px', 
                    height: '30px', 
                    fontSize: '30px', 
                    cursor: 'pointer',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                }} title="Fechar">
                    <IoMdCloseCircleOutline />
                </button>
                <ChatProvider>
                    <ChatLayout />
                </ChatProvider>
            </div>
        </div>
    );
};