import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
function AttachmentIcon({ size = 16 }) {
    return (_jsx("svg", { viewBox: "0 0 1024 1024", width: size, height: size, "aria-hidden": "true", children: _jsx("path", { d: "M516.373333 375.978667l136.576-136.576a147.797333 147.797333 0 0 1 208.853334-0.021334 147.690667 147.690667 0 0 1-0.042667 208.832l-204.8 204.778667v0.021333l-153.621333 153.6c-85.973333 85.973333-225.28 85.973333-311.253334 0.021334-85.994667-85.973333-85.973333-225.216 0.149334-311.36L431.146667 256.362667a21.333333 21.333333 0 0 0-30.165334-30.165334L162.069333 465.066667c-102.805333 102.826667-102.826667 269.056-0.149333 371.733333 102.613333 102.613333 268.970667 102.613333 371.584 0l153.6-153.642667h0.021333l0.021334-0.021333 204.778666-204.778667c74.325333-74.325333 74.346667-194.858667 0.021334-269.184-74.24-74.24-194.88-74.24-269.162667 0.042667l-136.576 136.554667-187.626667 187.626666a117.845333 117.845333 0 0 0-0.106666 166.826667 118.037333 118.037333 0 0 0 166.826666-0.106667l255.850667-255.829333a21.333333 21.333333 0 0 0-30.165333-30.165333L435.136 669.973333a75.370667 75.370667 0 0 1-106.496 0.106667 75.178667 75.178667 0 0 1 0.128-106.496l187.605333-187.605333z", fill: "currentColor" }) }));
}
function WebSearchIcon({ size = 17 }) {
    return (_jsxs("svg", { viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "9", fill: "none", stroke: "currentColor", strokeWidth: "1.8" }), _jsx("path", { d: "M3.5 12h17M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21M12 3C9.5 5.5 8.2 8.5 8.2 12s1.3 6.5 3.8 9", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" })] }));
}
function resolveThemeFromChannelConfig(uiTheme) {
    if (!uiTheme || typeof uiTheme !== 'object')
        return {};
    const chatPanel = uiTheme.chat_panel;
    if (!chatPanel || typeof chatPanel !== 'object')
        return {};
    return {
        primaryColor: chatPanel.primary_color,
        fontFamily: chatPanel.font_family,
        welcomeMessage: chatPanel.welcome_message ?? undefined,
    };
}
export function ChatWidget({ channelKey, apiBase = '', theme = {}, debug = false, user, onDialog, onReady, onError, style, className, enableThreadList = false, }) {
    const [resolvedTheme, setResolvedTheme] = useState({ ...DEFAULT_THEME, ...theme });
    const { primaryColor, fontFamily, placeholder, welcomeMessage } = resolvedTheme;
    const threadListEnabled = enableThreadList && Boolean(user?.userId);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const [webSearchAvailable, setWebSearchAvailable] = useState(false);
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [error, setError] = useState(null);
    const [threads, setThreads] = useState([]);
    const [activeThreadId, setActiveThreadId] = useState(null);
    const [threadsLoading, setThreadsLoading] = useState(false);
    const [threadError, setThreadError] = useState(null);
    const sdkRef = useRef(null);
    const emitterRef = useRef(null);
    const currentMsgIdRef = useRef(null);
    const fileInputRef = useRef(null);
    const listRef = useRef(null);
    const renderThreadHistory = useCallback((threadData) => {
        const historyMessages = (threadData.messages ?? [])
            .flatMap((msg, index) => {
            if ((msg.role === 'user' || msg.role === 'assistant') && msg.content) {
                return [{
                        id: `history_${index}_${msg.role}`,
                        role: msg.role,
                        content: msg.content,
                        state: 'done',
                    }];
            }
            return [];
        });
        setMessages(historyMessages);
    }, []);
    const refreshThreads = useCallback(async () => {
        if (!threadListEnabled || !sdkRef.current)
            return;
        setThreadsLoading(true);
        try {
            const items = await sdkRef.current.listThreads();
            const normalized = items.map((item, index) => {
                const record = item;
                const id = typeof record.id === 'string' ? record.id : `thread_${index}`;
                return {
                    id,
                    title: typeof record.title === 'string' ? record.title : null,
                    updatedAt: typeof record.updated_at === 'string' ? record.updated_at : null,
                };
            });
            setThreads(normalized);
            setActiveThreadId(sdkRef.current.threadId);
        }
        finally {
            setThreadsLoading(false);
        }
    }, [threadListEnabled]);
    const handleSwitchThread = useCallback(async (threadId) => {
        if (!sdkRef.current || !threadId || isStreaming)
            return;
        setThreadError(null);
        setPendingFiles([]);
        setInputValue('');
        setIsStreaming(false);
        try {
            const threadData = await sdkRef.current.switchThread(threadId);
            setActiveThreadId(threadId);
            renderThreadHistory(threadData);
            await refreshThreads();
        }
        catch (err) {
            setThreadError(err instanceof Error ? err.message : String(err));
        }
    }, [isStreaming, refreshThreads, renderThreadHistory]);
    const handleNewThread = useCallback(async () => {
        if (!sdkRef.current || isStreaming || !threadListEnabled)
            return;
        setThreadError(null);
        setPendingFiles([]);
        setInputValue('');
        setMessages([]);
        try {
            const threadId = await sdkRef.current.newThread();
            setActiveThreadId(threadId);
            await refreshThreads();
        }
        catch (err) {
            setThreadError(err instanceof Error ? err.message : String(err));
        }
    }, [isStreaming, refreshThreads, threadListEnabled]);
    // Initialize SDK
    useEffect(() => {
        const init = async () => {
            try {
                setWebSearchAvailable(false);
                setWebSearchEnabled(false);
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
                setResolvedTheme({
                    ...DEFAULT_THEME,
                    ...resolveThemeFromChannelConfig(sdk.channelConfig?.ui_theme),
                    ...theme,
                });
                const searchAvailable = sdk.channelConfig?.web_search_enabled === true;
                setWebSearchAvailable(searchAvailable);
                setWebSearchEnabled(false);
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
                setActiveThreadId(sdk.threadId);
                if (threadListEnabled) {
                    await refreshThreads();
                }
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
    }, [channelKey, apiBase, debug, user, theme, threadListEnabled, refreshThreads]);
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
            webSearchEnabled,
        });
        emitterRef.current = emitter;
        // Handle events
        emitter.on('RunStarted', (event) => {
            const threadId = event.payload.thread_id;
            if (threadId) {
                setActiveThreadId(threadId);
            }
        });
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
            if (threadListEnabled) {
                refreshThreads();
            }
        });
        emitter.on('Error', (event) => {
            const errorMsg = event.payload.message || 'Unknown error';
            setMessages(prev => prev.map(m => m.id === assistantMsgId
                ? { ...m, content: `错误: ${errorMsg}`, state: 'error' }
                : m));
            setIsStreaming(false);
        });
    }, [inputValue, pendingFiles, isReady, refreshThreads, threadListEnabled, webSearchEnabled]);
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
        }, className: className, children: [threadListEnabled && (_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderBottom: '1px solid #f3f4f6',
                    background: '#fff',
                }, children: [_jsxs("select", { value: activeThreadId ?? '', disabled: threadsLoading || isStreaming || !isReady, onChange: (e) => {
                            if (e.target.value) {
                                handleSwitchThread(e.target.value);
                            }
                        }, style: {
                            flex: 1,
                            minWidth: 0,
                            height: 36,
                            border: '1px solid #e5e7eb',
                            borderRadius: 10,
                            padding: '0 12px',
                            background: '#fff',
                            color: '#111827',
                            fontFamily,
                        }, children: [_jsx("option", { value: "", children: threads.length ? '选择会话' : '当前会话' }), threads.map((thread, index) => (_jsx("option", { value: thread.id, children: thread.title || `会话 ${threads.length - index}` }, thread.id)))] }), _jsx("button", { onClick: handleNewThread, disabled: threadsLoading || isStreaming || !isReady, style: {
                            flexShrink: 0,
                            height: 36,
                            padding: '0 12px',
                            border: 'none',
                            borderRadius: 10,
                            background: primaryColor,
                            color: '#fff',
                            cursor: 'pointer',
                            opacity: threadsLoading || isStreaming || !isReady ? 0.5 : 1,
                        }, children: "\u65B0\u4F1A\u8BDD" })] })), threadListEnabled && threadError && (_jsx("div", { style: {
                    padding: '8px 12px',
                    borderBottom: '1px solid #f3f4f6',
                    color: '#dc2626',
                    fontSize: 12,
                    background: '#fef2f2',
                }, children: threadError })), _jsx(MessageList, { messages: messages, primaryColor: primaryColor }), messages.length === 0 && isReady && welcomeMessage && (_jsx("div", { style: {
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
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                    }, children: [_jsx(AttachmentIcon, { size: 14 }), _jsx("span", { children: f.name }), _jsx("button", { onClick: () => setPendingFiles(prev => prev.filter((_, idx) => idx !== i)), style: { marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }, children: "\u00D7" })] }, i))) })), _jsxs("div", { style: {
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
                            color: '#3D3D3D',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }, children: _jsx(AttachmentIcon, {}) }), webSearchAvailable && (_jsx("button", { type: "button", onClick: () => setWebSearchEnabled((enabled) => !enabled), disabled: isStreaming || !isReady, "aria-label": webSearchEnabled ? '关闭联网搜索' : '开启联网搜索', "aria-pressed": webSearchEnabled, title: webSearchEnabled ? '联网搜索已开启' : '联网搜索已关闭', style: {
                            flexShrink: 0,
                            width: 32,
                            height: 32,
                            border: 'none',
                            borderRadius: 8,
                            background: webSearchEnabled ? `${primaryColor}18` : 'transparent',
                            cursor: isStreaming || !isReady ? 'not-allowed' : 'pointer',
                            opacity: isStreaming || !isReady ? 0.5 : 1,
                            color: webSearchEnabled ? primaryColor : '#9CA3AF',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }, children: _jsx(WebSearchIcon, {}) })), _jsx("textarea", { value: inputValue, onChange: (e) => setInputValue(e.target.value), placeholder: placeholder, disabled: isStreaming || !isReady, onKeyDown: (e) => {
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