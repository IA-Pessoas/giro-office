import React from 'react';

export const chatListItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', padding: '12px 15px',
    cursor: 'pointer', borderBottom: '1px solid #f0f2f5',
};

export const chatListItemSelectedStyle: React.CSSProperties = {
    ...chatListItemStyle,
    backgroundColor: '#e9edef',
};

export const conversationPanelStyle: React.CSSProperties = {
    position: 'relative',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1,

    backgroundColor: '#2131', // Cor de fundo base, caso a imagem não carregue
    backgroundImage: `url('../../bg-chat-cbca-mini.png')`, // Caminho para a sua imagem na pasta /public
    backgroundRepeat: 'repeat', // Faz a imagem se repetir para formar o padrão
};

export const welcomePanelStyle: React.CSSProperties = {
    ...conversationPanelStyle,
    alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#41525d',
};

export const conversationHeaderStyle: React.CSSProperties = {
    padding: '10px 16px', 
    backgroundColor: '#f0f2f5', 
    borderBottom: '1px solid #d1d7db', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'start'
};

export const messageBubbleContainerBase: React.CSSProperties = {
    display: 'flex', marginBottom: '12px', maxWidth: '65%',
};

export const sentBubbleContainerStyle: React.CSSProperties = {
    ...messageBubbleContainerBase,
    maxWidth: '99%',
    alignSelf: 'flex-end',
    justifyContent: 'flex-end'
};

export const receivedBubbleContainerStyle: React.CSSProperties = {
    ...messageBubbleContainerBase,
    alignSelf: 'flex-start',
};

export const messageBubbleBase: React.CSSProperties = {
    padding: '8px 12px', borderRadius: '8px', boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
};

export const sentBubbleStyle: React.CSSProperties = {
    ...messageBubbleBase,
    backgroundColor: '#2f406a',
    color: '#fff'
};

export const receivedBubbleStyle: React.CSSProperties = {
    ...messageBubbleBase,
    backgroundColor: '#3b3b3b',
    color: '#fff'

};


export const highlightedBubbleStyle: React.CSSProperties = {
    ...messageBubbleBase, // Assume que você tem um estilo base
    backgroundColor: '#d0ab70', // Cor de destaque amarela forte
    border: '2px solid #2f406a',
    color: '#000',
    transition: 'background-color 0.5s ease',
};

// Estilo para o balão de mensagem deletada
export const deletedBubbleStyle: React.CSSProperties = {
    ...messageBubbleBase,
    backgroundColor: '#f5f5f5',
    fontStyle: 'italic',
    color: '#888',
};