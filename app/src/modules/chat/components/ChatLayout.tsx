import React from 'react';
import { ChatListPanel } from './ChatListPanel';
import { ConversationWindow } from './ConversationWindow';

export const ChatLayout = () => {
    return (
        <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <ChatListPanel />
            <ConversationWindow />
        </div>
    );
};