import React from 'react';
import { Box } from '@chakra-ui/react';
import { ChatListPanel } from './ChatListPanel';
import { ConversationWindow } from './ConversationWindow';

export const ChatLayout = () => {
    return (
        <Box 
            display={'flex'}
            height={'100%'}
            width={'100%'}
        >
            <ChatListPanel />
            <ConversationWindow />
        </Box>
    );
};