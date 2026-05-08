import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
// React ChatWidget - complete chat component
import { useEffect, useRef, useState, useCallback } from 'react';
import { WebAASDK, } from '../core';
import { MessageList } from './MessageList';
const DEFAULT_THEME = {
    primaryColor: '#1890ff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    placeholder: '输入消息...',
    welcomeMessage: '你好，有什么可以帮助你的？',
};
export function ChatWidget({ channelKey, apiBase = '', theme = {}, debug = false, user, onDialog, onReady, onError, style, className, }) {
    const mergedTheme = { ...DEFAULT_THEME, ...theme };
    const { primaryColor, fontFamily, placeholder, welcomeMessage } = mergedTheme;
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const sdkRef = useRef(null);
    const emitterRef = useRef(null);
    const currentMsgIdRef = useRef(null);
    const fileInputRef = useRef(null);
    const listRef = useRef(null);
    // Initialize SDK
    useEffect(() => {
        const init = async () => {
            try {
                const sdk = new WebAASDK();
                sdkRef.current = sdk;
                // Set custom dialog handler
                if (onDialog) {
                    sdk.setDialogHandler(onDialog);
                }
                else {
                    // Use default React dialog handler
                    sdk.setDialogHandler(handleDialog);
                }
                await sdk.init({
                    channelKey,
                    apiBase,
                    debug,
                    user,
                });
                // Create temporary user if not provided
                if (!user) {
                    let tempUserId = sessionStorage.getItem(`aa_temp_user_${channelKey}`);
                    if (!tempUserId) {
                        tempUserId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                        sessionStorage.setItem(`aa_temp_user_${channelKey}`, tempUserId);
                    }
                    await sdk.identify({ userId: tempUserId });
                }
                setIsReady(true);
                onReady?.();
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setError(msg);
                onError?.(new Error(msg));
            }
        };
        init();
        return () => {
            sdkRef.current?.disconnect();
        };
    }, [channelKey, apiBase, debug, user]);
    // Default dialog handler (shows React components)
    const handleDialog = async (params) => {
        return new Promise((resolve) => {
            // Add dialog as a message
            const dialogId = `dialog_${Date.now()}`;
            if (params.action === 'confirm') {
                setMessages(prev => [...prev, {
                        id: dialogId,
                        role: 'assistant',
                        content: '',
                        state: 'done',
                    }]);
                // We'll handle this via a special dialog message type
                // For simplicity, use browser confirm as fallback
                const confirmed = window.confirm(params.message);
                setMessages(prev => prev.filter(m => m.id !== dialogId));
                resolve({ action: 'confirm', message: params.message, confirmed });
            }
            else if (params.action === 'input') {
                const value = window.prompt(params.message + (params.placeholder ? ` (${params.placeholder})` : '')) ?? '';
                resolve({ action: 'input', message: params.message, value });
            }
            else if (params.action === 'notify') {
                resolve({ action: 'notify', message: params.message, success: true });
            }
            else if (params.action === 'error') {
                resolve({ action: 'error', message: params.message, error_shown: true });
            }
            else {
                resolve({ success: false, error: 'Unknown action' });
            }
        });
    };
    // Send message
    const handleSend = useCallback(() => {
        const text = inputValue.trim();
        if (!text && pendingFiles.length === 0)
            return;
        if (!sdkRef.current || !isReady)
            return;
        // Add user message
        const userMsgId = `msg_${Date.now()}_user`;
        const userFiles = pendingFiles.map(f => ({
            name: f.name,
            type: f.type,
            objectUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
        }));
        setMessages(prev => [...prev, {
                id: userMsgId,
                role: 'user',
                content: text,
                state: 'done',
                files: userFiles.length > 0 ? userFiles : undefined,
            }]);
        // Add assistant placeholder
        const assistantMsgId = `msg_${Date.now()}_assistant`;
        currentMsgIdRef.current = assistantMsgId;
        setMessages(prev => [...prev, {
                id: assistantMsgId,
                role: 'assistant',
                content: '',
                state: 'streaming',
            }]);
        setInputValue('');
        setPendingFiles([]);
        setIsStreaming(true);
        // Run SDK
        const emitter = sdkRef.current.run({
            userInput: text,
            files: pendingFiles.length > 0 ? pendingFiles : undefined,
        });
        emitterRef.current = emitter;
        // Handle events
        emitter.on('TextMessageDelta', (event) => {
            const delta = event.payload.delta;
            if (delta) {
                setMessages(prev => prev.map(m => m.id === assistantMsgId
                    ? { ...m, content: m.content + delta }
                    : m));
            }
        });
        emitter.on('ToolCallEnd', (event) => {
            const toolName = event.payload.tool_name;
            const result = event.payload.result;
            if (toolName === 'chart_skill' && result?.success && result.echarts_options) {
                setMessages(prev => prev.map(m => m.id === assistantMsgId
                    ? { ...m, chartData: result }
                    : m));
            }
        });
        emitter.on('RunFinished', () => {
            setMessages(prev => prev.map(m => m.id === assistantMsgId
                ? { ...m, state: 'done' }
                : m));
            setIsStreaming(false);
        });
        emitter.on('Error', (event) => {
            const errorMsg = event.payload.message || 'Unknown error';
            setMessages(prev => prev.map(m => m.id === assistantMsgId
                ? { ...m, content: `错误: ${errorMsg}`, state: 'error' }
                : m));
            setIsStreaming(false);
        });
    }, [inputValue, pendingFiles, isReady]);
    // Stop
    const handleStop = useCallback(() => {
        sdkRef.current?.disconnect();
        emitterRef.current?.removeAllListeners();
        setIsStreaming(false);
    }, []);
    // File handling
    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesArray = [];
            for (let i = 0; i < e.target.files.length; i++) {
                filesArray.push(e.target.files[i]);
            }
            setPendingFiles(prev => [...prev, ...filesArray]);
        }
        e.target.value = '';
    };
    // Render
    if (error) {
        return (_jsxs("div", { style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#dc2626',
                fontFamily,
            }, children: ["\u521D\u59CB\u5316\u5931\u8D25: ", error] }));
    }
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            fontFamily,
            ...style,
        }, className: className, children: [_jsx(MessageList, { messages: messages, primaryColor: primaryColor }), messages.length === 0 && isReady && welcomeMessage && (_jsx("div", { style: {
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    color: '#666',
                }, children: welcomeMessage })), pendingFiles.length > 0 && (_jsx("div", { style: {
                    padding: '8px 16px',
                    background: '#fafafa',
                    borderBottom: '1px solid #e8e8e8',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                }, children: pendingFiles.map((f, i) => (_jsxs("div", { style: {
                        padding: '4px 8px',
                        background: '#fff',
                        border: '1px solid #d9d9d9',
                        borderRadius: 4,
                        fontSize: 12,
                    }, children: ["\uD83D\uDCCE ", f.name, _jsx("button", { onClick: () => setPendingFiles(prev => prev.filter((_, idx) => idx !== i)), style: { marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }, children: "\u00D7" })] }, i))) })), _jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 8,
                    padding: '10px 12px',
                    borderTop: '1px solid #f3f4f6',
                    background: '#fff',
                }, children: [_jsx("input", { ref: fileInputRef, type: "file", multiple: true, accept: "image/*,.pdf,.txt,.csv,.doc,.docx", style: { display: 'none' }, onChange: handleFileSelect }), _jsx("button", { onClick: () => fileInputRef.current?.click(), disabled: isStreaming || !isReady, style: {
                            flexShrink: 0,
                            width: 32,
                            height: 32,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            opacity: isStreaming || !isReady ? 0.5 : 1,
                        }, children: "\uD83D\uDCCE" }), _jsx("textarea", { value: inputValue, onChange: (e) => setInputValue(e.target.value), placeholder: placeholder, disabled: isStreaming || !isReady, onKeyDown: (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }, style: {
                            flex: 1,
                            resize: 'none',
                            border: '1px solid #e5e7eb',
                            borderRadius: 10,
                            padding: '8px 12px',
                            fontSize: 14,
                            fontFamily,
                            outline: 'none',
                            maxHeight: 120,
                        }, rows: 1 }), isStreaming ? (_jsx("button", { onClick: handleStop, style: {
                            flexShrink: 0,
                            width: 36,
                            height: 36,
                            border: 'none',
                            borderRadius: 10,
                            background: '#ef4444',
                            color: '#fff',
                            cursor: 'pointer',
                        }, children: "\u23F9" })) : (_jsx("button", { onClick: handleSend, disabled: !isReady || (!inputValue.trim() && pendingFiles.length === 0), style: {
                            flexShrink: 0,
                            width: 36,
                            height: 36,
                            border: 'none',
                            borderRadius: 10,
                            background: primaryColor,
                            color: '#fff',
                            cursor: 'pointer',
                            opacity: !isReady || (!inputValue.trim() && pendingFiles.length === 0) ? 0.5 : 1,
                        }, children: "\u27A4" }))] })] }));
}
//# sourceMappingURL=ChatWidget.js.map