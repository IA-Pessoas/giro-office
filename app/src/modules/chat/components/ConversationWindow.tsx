import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { GrSend } from "react-icons/gr";
import { IoMdMic } from "react-icons/io";
import { FiPaperclip } from "react-icons/fi";
import { FaRegTrashAlt } from "react-icons/fa";
import { FaDeleteLeft } from "react-icons/fa6";
import { FaRegEdit } from "react-icons/fa";
import { GiConfirmed } from "react-icons/gi";
import { CiCircleInfo } from "react-icons/ci";
import { FaPencilRuler } from "react-icons/fa";

import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import * as styles from '../../../styles/chat'
import { useClickOutside } from '@shared/hooks/useClickOutside';

import { GroupInfoSidebar } from './GroupInfoSidebar';

const parseSpace = (value: any) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return `${value}px`;
    return value;
};

const getStyleFromProps = (props: any): React.CSSProperties => ({
    display: props.display,
    alignItems: props.alignItems,
    justifyContent: props.justifyContent,
    flexDirection: props.flexDirection,
    flexGrow: props.flexGrow,
    position: props.position ?? props.pos,
    top: parseSpace(props.top),
    right: parseSpace(props.right),
    bottom: parseSpace(props.bottom),
    left: parseSpace(props.left),
    width: parseSpace(props.width ?? props.w),
    height: parseSpace(props.height ?? props.h),
    maxHeight: parseSpace(props.maxH),
    background: props.bg ?? props.background ?? props.backgroundColor,
    border: props.border,
    borderColor: props.borderColor,
    borderRadius: parseSpace(props.borderRadius),
    overflow: props.overflow,
    overflowX: props.overflowX,
    overflowY: props.overflowY,
    boxShadow: props.boxShadow,
    color: props.color,
    fontSize: parseSpace(props.fontSize),
    fontWeight: props.fontWeight,
    lineHeight: props.lineHeight,
    textAlign: props.textAlign,
    resize: props.resize,
    zIndex: props.zIndex,
    padding: parseSpace(props.p),
    margin: parseSpace(props.m ?? props.margin),
    marginTop: parseSpace(props.mt),
    marginBottom: parseSpace(props.mb),
    marginLeft: parseSpace(props.ml),
    marginRight: parseSpace(props.mr),
});

const Box = React.forwardRef<HTMLDivElement, any>(({ children, style, ...props }, ref) => (
    <div
        ref={ref}
        id={props.id}
        onClick={props.onClick}
        onScroll={props.onScroll}
        style={{ ...getStyleFromProps(props), ...style }}
    >
        {children}
    </div>
));
Box.displayName = 'BoxShim';

const Text = ({ children, style, ...props }: any) => (
    <p style={{ margin: 0, ...getStyleFromProps(props), ...style }}>{children}</p>
);

const Button = ({ children, style, ...props }: any) => (
    <button
        type={props.type ?? 'button'}
        onClick={props.onClick}
        disabled={props.disabled}
        title={props.title}
        style={{
            border: 'none',
            background: 'transparent',
            cursor: props.disabled ? 'not-allowed' : 'pointer',
            ...getStyleFromProps(props),
            ...style,
        }}
    >
        {children}
    </button>
);

const Input = React.forwardRef<HTMLInputElement, any>(({ style, ...props }, ref) => (
    <input
        ref={ref}
        type={props.type}
        value={props.value}
        onChange={props.onChange}
        onClick={props.onClick}
        placeholder={props.placeholder}
        disabled={props.disabled}
        accept={props.accept}
        style={{ ...getStyleFromProps(props), ...style }}
    />
));
Input.displayName = 'InputShim';

const Textarea = React.forwardRef<HTMLTextAreaElement, any>(({ style, ...props }, ref) => (
    <textarea
        ref={ref}
        value={props.value}
        onChange={props.onChange}
        onKeyDown={props.onKeyDown}
        rows={props.rows}
        placeholder={props.placeholder}
        disabled={props.disabled}
        style={{ ...getStyleFromProps(props), ...style }}
    />
));
Textarea.displayName = 'TextareaShim';

interface MessageInputProps {
    onSendMessage: (payload: { content: string; fileUrl?: string; type?: 'TEXT' | 'IMAGE' | 'AUDIO' }) => void;
}

const MessageBubble = ({ message, isSentByMe, chatType, isHighlighted }) => {
    const bubbleStyle = isSentByMe ? styles.sentBubbleStyle : styles.receivedBubbleStyle;
    const finalStyle = isHighlighted ? { ...bubbleStyle, ...styles.highlightedBubbleStyle } : bubbleStyle;
    const { getSignedMediaUrl } = useChat();
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [isLoadingMedia, setIsLoadingMedia] = useState(false);
    const { startEditingMessage, deleteMessage } = useChat();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const canInteract = isSentByMe && (new Date().getTime() - new Date(message.createdAt).getTime()) < 300000;

    useEffect(() => {
        // Roda apenas se for uma mensagem de mídia e se a URL ainda não foi buscada
        if ((message.type === 'IMAGE' || message.type === 'AUDIO') && message.fileUrl && !mediaUrl) {
            setIsLoadingMedia(true);
            getSignedMediaUrl(message.fileUrl)
                .then(url => setMediaUrl(url))
                .finally(() => setIsLoadingMedia(false));
        }
    }, [message.fileUrl, getSignedMediaUrl, mediaUrl]);

    const renderContent = () => {
        if (message.type === 'IMAGE' || message.type === 'AUDIO') {
            if (isLoadingMedia) {
                return <Text style={{ fontStyle: 'italic' }}>Carregando mídia...</Text>;
            }
            if (!mediaUrl) {
                return <Text style={{ fontStyle: 'italic', color: 'red' }}>Erro ao carregar mídia</Text>;
            }
            if (message.type === 'IMAGE') {
                return (
                    <img
                        src={mediaUrl}
                        alt={message.content || 'Imagem enviada'}
                        loading="lazy"
                        decoding="async"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '250px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                        }}
                        onClick={() => window.open(mediaUrl, '_blank', 'noopener,noreferrer')}
                    />
                );
            }
            if (message.type === 'AUDIO') {
                return <audio controls src={mediaUrl} style={{ width: '250px' }}></audio>;
            }
        }
        
        // Conteúdo de texto padrão
        return <Text style={{ margin: 0, wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>{message.content}</Text>;
    };

    const closeMenu = () => {
        setIsMenuOpen(false);
    };
    const menuRef = useClickOutside(closeMenu);


    // Se a mensagem foi deletada, mostra um bloco especial
    if (message.type === 'DELETED') {
        return (
            <Box style={isSentByMe ? styles.sentBubbleContainerStyle : styles.receivedBubbleContainerStyle}>
                <Box style={styles.deletedBubbleStyle}>
                    <Text display={'flex'} alignItems={'center'} gap={'5px'} m={0}><FaDeleteLeft /> Mensagem apagada</Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box style={isSentByMe ? styles.sentBubbleContainerStyle : styles.receivedBubbleContainerStyle}>
            <Box style={finalStyle}>
                {!isSentByMe && chatType === 'GROUP' && (
                    <Text fontSize='0.8em' fontWeight='bold' color='#54656f' marginBottom='4px'>{message.sender.name}</Text>
                )}
                {renderContent()}
                <span style={{ fontSize: '0.7em', color: '#667781', float: 'right', marginLeft: '10px', marginTop: '5px' }}>
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Box display={'flex'} alignItems={'center'} float={'right'} ml={'10px'} mt={'5px'}>
                    {message.isEdited && <span style={{ fontSize: '0.7em', color: '#888', marginRight: '5px' }}><FaRegEdit /></span> }
                </Box>
            </Box>
            {canInteract && (
                <Box 
                    ref={menuRef} 
                    display={'flex'}
                    alignItems={'center'}
                    paddingLeft={'8px'}
                    cursor={'pointer'}
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                    <FaPencilRuler />
                    {isMenuOpen && (
                        <Box 
                            pos={'relative'}
                            top={'25px'}
                            right={0}
                            bg={'bodyBg'}
                            border={'1px solid'}
                            borderColor={'mainOpacity'}
                            borderRadius={'8px'}
                            boxShadow={'0 2px 10px rgba(0,0,0,0.2)'}
                            zIndex={10}
                            overflow={'hidden'}
                            width={'100px'}
                        >
                            <Button 
                                onClick={() => startEditingMessage(message)}
                                display={'block'}
                                w={'100%'}
                                p={'10px'}
                                border={'none'}
                                background={'none'}
                                textAlign={'left'}
                                cursor={'pointer'}
                                _hover={{ bg: 'none', color: 'primaryText' }}
                            >
                                Editar
                            </Button>
                            <Button 
                                onClick={() => deleteMessage(message.id)}
                                display={'block'}
                                w={'100%'}
                                p={'10px'}
                                border={'none'}
                                background={'none'}
                                textAlign={'left'}
                                cursor={'pointer'}
                                _hover={{ bg: 'none', color: 'primaryText' }}
                            >
                                Deletar
                            </Button>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};

const MessageInput = ({ onSendMessage }: MessageInputProps) => {
    const { sendMessage, uploadFileAndSendMessage, isUploading, editingMessage, cancelEditingMessage, editMessage } = useChat();
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const fileInputRef = useRef<HTMLInputElement>(null); 
    const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
    const [imageToPreview, setImageToPreview] = useState<File | null>(null);
    
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const wasCancelledRef = useRef(false);
    const recordingRequestIdRef = useRef(0);

    const [isHovered, setIsHovered] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [clipIsHovered, setClipIsHovered] = useState(false);
    const [clipIsActive, setClipIsActive] = useState(false);
    const [recordingIsHovered, setRecordingIsHovered] = useState(false);
    const [recordingIsActive, setRecordingIsActive] = useState(false);
    const [recordIsHovered, setRecordIsHovered] = useState(false);
    const [recordIsActive, setRecordIsActive] = useState(false);
    
    const handleSendText = () => {
        if (text.trim()) {
            if (editingMessage) {
                // Se estiver editando, chama a função de editar
                editMessage(editingMessage.id, text);
            } else {
                // Se não, envia uma nova mensagem
                sendMessage({ content: text, type: 'TEXT' });
            }
            setText('');
        }
    };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
        }
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type.startsWith('image/')) {
                setImageToPreview(file);
                setIsImagePreviewOpen(true);
            } else {
                uploadFileAndSendMessage(file);
            }
            if (e.target) e.target.value = null;
        }
    };
    const handleConfirmImageSend = () => {
        if (imageToPreview) {
            uploadFileAndSendMessage(imageToPreview);
            setImageToPreview(null);
            setIsImagePreviewOpen(false);
        }
    };
    const handleCancelImageSend = () => {
        setImageToPreview(null);
        setIsImagePreviewOpen(false);
    };
    
    
    const handleAttachClick = () => {
        fileInputRef.current?.click();
    };

    const clearRecordingTimer = useCallback(() => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    }, []);

    const stopMediaStream = useCallback((stream: MediaStream | null) => {
        stream?.getTracks().forEach((track) => track.stop());
    }, []);

    const stopRecordingStream = useCallback(() => {
        stopMediaStream(recordingStreamRef.current);
        recordingStreamRef.current = null;
    }, [stopMediaStream]);

    const stopActiveRecording = useCallback((cancelled: boolean, updateState = true) => {
        recordingRequestIdRef.current += 1;
        wasCancelledRef.current = cancelled;
        clearRecordingTimer();

        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        } else {
            mediaRecorderRef.current = null;
            stopRecordingStream();
        }

        if (updateState) {
            setIsRecording(false);
        }
    }, [clearRecordingTimer, stopRecordingStream]);

    const handleStartRecording = async () => {
        const recordingRequestId = recordingRequestIdRef.current + 1;
        recordingRequestIdRef.current = recordingRequestId;
        wasCancelledRef.current = false;
        clearRecordingTimer();
        stopRecordingStream();

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (
                    wasCancelledRef.current ||
                    recordingRequestIdRef.current !== recordingRequestId
                ) {
                    stopMediaStream(stream);
                    return;
                }

                recordingStreamRef.current = stream;
                const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
                mediaRecorderRef.current = mediaRecorder;
                audioChunksRef.current = [];

                mediaRecorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);

                mediaRecorder.onstop = () => {
                    // Só envia se NÃO foi cancelado
                    if (!wasCancelledRef.current) {
                        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                        const audioFile = new File([audioBlob], `gravacao_${Date.now()}.webm`, {
                            type: "audio/webm",
                        });
                        uploadFileAndSendMessage(audioFile);
                    }
                    // Limpa a stream para desligar o ícone do microfone no navegador
                    mediaRecorderRef.current = null;
                    stopRecordingStream();
                };

                mediaRecorder.start();
                setIsRecording(true);

                // Inicia o cronômetro
                setRecordingTime(0);
                timerIntervalRef.current = setInterval(() => {
                    setRecordingTime(prevTime => prevTime + 1);
                }, 1000);

            } catch (err) {
                mediaRecorderRef.current = null;
                stopRecordingStream();
                clearRecordingTimer();
                setIsRecording(false);
                console.error("Erro ao acessar o microfone:", err);
                alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
            }
        }
    };
    const handleStopRecording = () => {
        stopActiveRecording(false);
    };
    const handleStopAndSendRecording = () => {
        stopActiveRecording(false);
    };
    const handleCancelRecording = () => {
        stopActiveRecording(true);
    };
    const handleAudioButtonClick = () => {
        if (isRecording) {
            handleStopRecording();
        } else {
            handleStartRecording();
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60).toString().padStart(2, '0');
        const seconds = (time % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    };

    useEffect(() => {
        return () => {
            stopActiveRecording(true, false);
        };
    }, [stopActiveRecording]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [text]);

    useEffect(() => {
        if (editingMessage) {
            setText(editingMessage.content);
            textareaRef.current?.focus();
        } else {
            setText('');
        }
    }, [editingMessage]);
    
    return (
        <Box display={'flex'} bg={'componentColorReverse'} alignItems={'center'} borderRadius={'8px'}>
            {isRecording ? (
                <Box 
                    display={'flex'}
                    alignItems={'center'}
                    justifyContent={'center'}
                    w={'100%'}
                    p={'0 10px'}
                >
                    <Button 
                        onMouseEnter={() => setRecordingIsHovered(true)}
                        onMouseLeave={() => { setRecordingIsHovered(false); setRecordingIsActive(false); }}
                        onMouseDown={() => setRecordingIsActive(true)}
                        onMouseUp={() => setRecordingIsActive(false)}
                        onClick={handleCancelRecording} 
                        title="Cancelar gravação"

                        display={'flex'}
                        alignItems={'center'}
                        justifyContent={'center'}
                        background={'none'}
                        border={'none'}
                        cursor={'pointer'}
                        fontSize={'24px'}
                        color={'red'}
                        p={'0 8px'}
                        m={0}
                        _hover={{ transform: 'scale(1.2)' }}
                        _active={{ transform: 'scale(.95)' }}
                    >
                        <FaRegTrashAlt />
                    </Button>
                    <Box 
                        display={'flex'}
                        alignItems={'center'}
                        color={'bodyText'}
                        fontWeight={'bold'}
                        fontSize={'26px'}
                        pt={'4px'}
                        pb={'3px'}
                    >
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: '8px', animation: 'pulse 1.5s infinite' }}></span>
                        {formatTime(recordingTime)}
                    </Box>
                    <Button 
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => { setIsHovered(false); setIsActive(false); }}
                        onMouseDown={() => setIsActive(true)}
                        onMouseUp={() => setIsActive(false)}
                        onClick={handleStopAndSendRecording} 
                        title="Enviar áudio"
                        display={'flex'}
                        alignItems={'center'}
                        justifyContent={'center'}
                        background={'none'}
                        border={'none'}
                        cursor={'pointer'}
                        fontSize={'24px'}
                        color={'primaryText'}
                        p={'0 8px'}
                        m={0}
                        _hover={{ transform: 'scale(1.2)' }}
                        _active={{ transform: 'scale(.95)', color: 'secondaryText' }}
                    >
                        <GrSend />
                    </Button>
                </Box>
            ) : (
                <>
                    {editingMessage && (
                        <Box 
                            w={'15%'}
                            p={'8px 15px'}
                            bg={'bodyBg'}
                            borderBottom={'1px solid'}
                            borderColor={'mainOpacity'}
                            display={'flex'}
                            alignItems={'center'}
                            justifyContent={'space-between'}
                            fontSize={'.9em'}
                        >
                            <Button onClick={cancelEditingMessage}>Cancelar</Button>
                        </Box>
                    )}
                    {isImagePreviewOpen && imageToPreview && (
                        <Box 
                            position={'fixed'}
                            top={0}
                            left={0}
                            width={'100%'}
                            height={'100%'}
                            backgroundColor={'rgba(0, 0, 0, 0.5)'}
                            display={'flex'}
                            justifyContent={'center'}
                            alignItems={'center'}
                            zIndex={1000}
                        >
                            <Box 
                                backgroundColor={'bodyBg'}
                                borderRadius={'8px'}
                                p={'20px'}
                                minW={'40%'}
                                maxW={'90%'}
                                maxH={'90%'}
                                overflow={'auto'}
                                textAlign={'center'}
                                display={'flex'}
                                flexDirection={'column'}
                                justifyContent={'center'}
                                alignItems={'center'}
                            >
                                <Text fontWeight={'bold'} mb={'10px'}>Enviar Imagem</Text>
                                <img
                                    src={URL.createObjectURL(imageToPreview)}
                                    alt="Pré-visualização"
                                    decoding="async"
                                    style={{ 
                                        maxWidth: '100%',
                                        maxHeight: '400px',
                                        marginBottom: '15px',
                                        borderRadius: '4px',
                                    }}
                                />
                                <Box display={'flex'} justifyContent={'space-around'} w={'70%'}>
                                    <Button 
                                        onClick={handleCancelImageSend}
                                        bg={'transparent'}
                                        _hover={{ color: 'red' }}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button 
                                        onClick={handleConfirmImageSend}
                                        bg={'componentColorReverse'} 
                                        _hover={{ backgroundColor: 'componentColor' }}

                                    >
                                        Enviar
                                    </Button>
                                </Box>
                            </Box>
                        </Box>
                    )}
                    {!editingMessage && (
                        <>
                            <Input 
                                type="file" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }}
                                onChange={handleFileChange}
                                accept="image/*,audio/*"
                            />

                            <Button 
                                type="button" 
                                onMouseEnter={() => setClipIsHovered(true)}
                                onMouseLeave={() => { setClipIsHovered(false); setClipIsActive(false); }}
                                onMouseDown={() => setClipIsActive(true)}
                                onMouseUp={() => setClipIsActive(false)}
                                onClick={handleAttachClick} 
                                disabled={isUploading} 
                                title="Anexar arquivo"

                                display={'flex'}
                                alignItems={'center'}
                                justifyContent={'center'}
                                background={'none'}
                                border={'none'}
                                cursor={'pointer'}
                                fontSize={'24px'}
                                color={'primaryText'}
                                p={'0 8px'}
                                m={0}
                                _hover={{ transform: 'scale(1.2)' }}
                                _active={{ transform: 'scale(.95)', color: 'secondaryText' }}
                            >
                                <FiPaperclip />
                            </Button>
                            
                            <Button 
                                display={'flex'}
                                alignItems={'center'}
                                justifyContent={'center'}
                                background={'none'}
                                border={'none'}
                                cursor={'pointer'}
                                fontSize={'24px'}
                                color={'primaryText'}
                                p={'0 8px'}
                                m={0}
                                _hover={{ transform: 'scale(1.2)' }}
                                _active={{ transform: 'scale(.95)', color: 'secondaryText' }}

                                onClick={handleAudioButtonClick} 
                                onMouseEnter={() => setRecordIsHovered(true)}
                                onMouseLeave={() => { setRecordIsHovered(false); setRecordIsActive(false); }}
                                onMouseDown={() => setRecordIsActive(true)}
                                onMouseUp={() => setRecordIsActive(false)}
                                disabled={isUploading} 
                                title={isRecording ? "Parar gravação" : "Gravar áudio"}
                            >
                                <IoMdMic />
                            </Button>

                        </>
                    )}
                    <Textarea
                        ref={textareaRef}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        placeholder={isUploading ? "Enviando mídia..." : isRecording ? "Gravando áudio..." : "Digite uma mensagem..."}
                        disabled={isUploading || isRecording}
                        flexGrow={1}
                        border={'none'}
                        p={'12px 15px'}
                        borderRadius={'20px'}
                        resize={'none'}
                        overflow={'hidden'}
                        maxH={'100px'}
                        lineHeight={'1.4'}
                        _focus={{ boxShadow: 'none',  }}
                    />
                    <Button 
                        type="button"
                        onClick={handleSendText} 
                        disabled={isUploading || isRecording}
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => { setIsHovered(false); setIsActive(false); }}
                        onMouseDown={() => setIsActive(true)}
                        onMouseUp={() => setIsActive(false)}

                        display={'flex'}
                        alignItems={'center'}
                        justifyContent={'center'}
                        background={'none'}
                        border={'none'}
                        cursor={'pointer'}
                        fontSize={'24px'}
                        color={'primaryText'}
                        p={'0 8px'}
                        m={0}
                        _hover={{ transform: 'scale(1.2)' }}
                        _active={{ transform: 'scale(.95)', color: 'secondaryText' }}
                    >
                        {editingMessage ? <GiConfirmed /> : <GrSend />}
                    </Button>
                </>
            )}
        </Box>
    );
};

export const ConversationWindow = () => {
    const { 
        selectedChat, messages, sendMessage, highlightedMessageId, 
        fetchMoreMessages, isLoadingMore, hasMoreMessages, scrollToBottomTrigger, firstUnreadId
    } = useChat();
    const { user: currentUser } = useAuth();
    const [isInfoSidebarOpen, setIsInfoSidebarOpen] = useState(false);
    
    const messageListRef = useRef<HTMLDivElement>(null);
    const scrollSnapshotRef = useRef<number | null>(null);

    // Efeito para rolar para uma mensagem específica (vinda da busca)
    useEffect(() => {
        if (highlightedMessageId) {
            const timer = setTimeout(() => {
                const element = document.getElementById(highlightedMessageId);
                if (element) {
                    element.scrollIntoView({ behavior: 'auto', block: 'center' });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [highlightedMessageId]);

    // Efeito para rolar para o final quando o gatilho é acionado
    useEffect(() => {
        if (scrollToBottomTrigger > 0 && messageListRef.current && !highlightedMessageId) {
            const messageList = messageListRef.current;
            const timer = setTimeout(() => {
                messageList.scrollTop = messageList.scrollHeight;
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [scrollToBottomTrigger]);

    // Efeito para preservar a posição do scroll ao carregar mensagens antigas
    useLayoutEffect(() => {
        if (scrollSnapshotRef.current !== null && messageListRef.current) {
            const messageList = messageListRef.current;
            messageList.scrollTop = messageList.scrollHeight - scrollSnapshotRef.current;
            scrollSnapshotRef.current = null;
        }
    }, [messages]);

    const handleScroll = () => {
        if (messageListRef.current && messageListRef.current.scrollTop === 0 && !isLoadingMore && hasMoreMessages) {
            scrollSnapshotRef.current = messageListRef.current.scrollHeight;
            fetchMoreMessages();
        }
    };
    
    const getChatName = () => {
        if (!selectedChat) return '';
        if (selectedChat.type === 'GROUP') return selectedChat.name;
        const otherParticipant = selectedChat.participants.find(p => currentUser && p.user.id !== currentUser.id);
        return otherParticipant?.user.name || 'Conversa';
    };
    
    if (!selectedChat) {
        return <Box style={{ position: 'relative', flexGrow: 1, display: 'flex', flexDirection: 'column', zIndex: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}><Text>Bem-vindo ao Chat</Text><p>Selecione uma conversa para começar.</p></Box>;
    }
    
    if (!currentUser) {
        return <Box style={{ position: 'relative', flexGrow: 1, display: 'flex', flexDirection: 'column', zIndex: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}><Text>Carregando conversa...</Text></Box>;
    }

    return (
        <Box style={{...styles.conversationPanelStyle, position: 'relative'}}>
            {isInfoSidebarOpen && selectedChat && (
                <GroupInfoSidebar 
                    chat={selectedChat} 
                    onClose={() => setIsInfoSidebarOpen(false)} 
                />
            )}

            <Box 
                p={'10px 16px'}
                bg={'bodyBg'}
                borderBottom={'1px solid'}
                borderColor={'mainOpacity'}
                display={'flex'}
                alignItems={'center'}
                justifyContent={'start'}
            >
                {selectedChat.type === 'GROUP' && (
                    <Button 
                        onClick={() => setIsInfoSidebarOpen(true)}
                        display={'flex'}
                        alignItems={'center'}
                        justifyContent={'center'}
                        background={'none'}
                        border={'none'}
                        cursor={'pointer'}
                        fontSize={'30px'}
                        fontWeight={'bold'}
                        color={'primaryText'}
                        m={0}
                        _hover={{ transform: 'scale(1.2)' }}
                        _active={{ transform: 'scale(.95)', color: 'secondaryText' }}
                    >
                        <CiCircleInfo />
                    </Button>
                )}
                <Text fontWeight={'bold'}>{getChatName()}</Text>
            </Box>
            
            <Box 
                ref={messageListRef} 
                onScroll={handleScroll}
                flexGrow={1}
                p={'10px 16px'}
                overflowY={'auto'}
                display={'flex'}
                flexDirection={'column'}
                bg={'transparent'}
                sx={{
                    '&::-webkit-scrollbar': { width: '4px' },
                    '&::-webkit-scrollbar-track': { background: 'transparent' },
                    '&::-webkit-scrollbar-thumb': { background: 'borderColorReverse', borderRadius: '24px' },
                }}
            >
                {isLoadingMore && 
                    <Box textAlign={'center'} p={'10px'} color={'primaryText'}>Carregando...</Box>
                }
                {!isLoadingMore && !hasMoreMessages && (
                    <Box 
                        textAlign={'center'} 
                        p={'10px'} 
                        bg={'componentColorReverse'}
                        borderRadius={'8px'}
                        mb={3}
                    >
                        <Text>
                            Este é o início da conversa.
                        </Text>
                    </Box>
                )}
                
                {messages.map(msg => (
                    <React.Fragment key={msg.id}>
                        {msg.id === firstUnreadId && (
                            <Box 
                                display={'flex'}
                                alignItems={'center'}
                                textAlign={'center'}
                                m={'15px 0'}
                            >
                                <Box flexGrow={1} border={'1px solid'} borderColor={'mainOpacity'}></Box>
                                <span style={{ padding: '0 10px', color: '#667781', fontSize: '0.8em', fontWeight: 'bold' }}>Mensagens não lidas</span>
                                <Box flexGrow={1} border={'1px solid'} borderColor={'mainOpacity'}></Box>
                            </Box>
                        )}
                        <Box id={msg.id} scrollMarginTop={'10px'}>
                            <MessageBubble 
                                message={msg} 
                                isSentByMe={currentUser.id === msg.sender_id}
                                chatType={selectedChat.type}
                                isHighlighted={msg.id === highlightedMessageId}
                            />
                        </Box>
                    </React.Fragment>
                ))}
            </Box>
            
            <Box 
                p={'10px 0'} 
                bg={'transparent'} 
                margin={'0 10px'}
                boxShadow={'0'}
            >
                <MessageInput onSendMessage={sendMessage} />
            </Box>
        </Box>
    );
};
