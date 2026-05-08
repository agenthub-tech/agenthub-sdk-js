// React ChatWidget - complete chat component

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  WebAASDK,
  type AGUIEvent,
  type Message,
  type MessageFile,
  type ChartSkillResult,
  type DialogParams,
  type DialogResult,
  type ChatWidgetConfig,
  type ChatWidgetTheme,
} from '../core';
import { MessageList } from './MessageList';
import { DialogConfirm, DialogInput, DialogNotify, DialogError } from './Dialog';

const DEFAULT_THEME: ChatWidgetTheme = {
  primaryColor: '#1890ff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  placeholder: '输入消息...',
  welcomeMessage: '你好，有什么可以帮助你的？',
};

export interface ChatWidgetProps extends ChatWidgetConfig {
  /** Container style */
  style?: React.CSSProperties;
  /** Container className */
  className?: string;
}

export function ChatWidget({
  channelKey,
  apiBase = '',
  theme = {},
  debug = false,
  user,
  onDialog,
  onReady,
  onError,
  style,
  className,
}: ChatWidgetProps): JSX.Element {
  const mergedTheme = { ...DEFAULT_THEME, ...theme };
  const { primaryColor, fontFamily, placeholder, welcomeMessage } = mergedTheme;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sdkRef = useRef<WebAASDK | null>(null);
  const emitterRef = useRef<{ on: (event: string, handler: (...args: any[]) => void) => void; removeAllListeners: () => void } | null>(null);
  const currentMsgIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Initialize SDK
  useEffect(() => {
    const init = async () => {
      try {
        const sdk = new WebAASDK();
        sdkRef.current = sdk;

        // Set custom dialog handler
        if (onDialog) {
          sdk.setDialogHandler(onDialog);
        } else {
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
      } catch (err) {
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
  const handleDialog = async (params: DialogParams): Promise<DialogResult> => {
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
      } else if (params.action === 'input') {
        const value = window.prompt(params.message + (params.placeholder ? ` (${params.placeholder})` : '')) ?? '';
        resolve({ action: 'input', message: params.message, value });
      } else if (params.action === 'notify') {
        resolve({ action: 'notify', message: params.message, success: true });
      } else if (params.action === 'error') {
        resolve({ action: 'error', message: params.message, error_shown: true });
      } else {
        resolve({ success: false, error: 'Unknown action' } as any);
      }
    });
  };

  // Send message
  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text && pendingFiles.length === 0) return;
    if (!sdkRef.current || !isReady) return;

    // Add user message
    const userMsgId = `msg_${Date.now()}_user`;
    const userFiles: MessageFile[] = pendingFiles.map(f => ({
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
    emitter.on('TextMessageDelta', (event: AGUIEvent) => {
      const delta = event.payload.delta as string;
      if (delta) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: m.content + delta }
            : m
        ));
      }
    });

    emitter.on('ToolCallEnd', (event: AGUIEvent) => {
      const toolName = event.payload.tool_name as string;
      const result = event.payload.result as ChartSkillResult | undefined;

      if (toolName === 'chart_skill' && result?.success && result.echarts_options) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, chartData: result }
            : m
        ));
      }
    });

    emitter.on('RunFinished', () => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, state: 'done' }
          : m
      ));
      setIsStreaming(false);
    });

    emitter.on('Error', (event: AGUIEvent) => {
      const errorMsg = (event.payload.message as string) || 'Unknown error';
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: `错误: ${errorMsg}`, state: 'error' }
          : m
      ));
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
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray: File[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        filesArray.push(e.target.files[i]);
      }
      setPendingFiles(prev => [...prev, ...filesArray]);
    }
    e.target.value = '';
  };

  // Render
  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#dc2626',
        fontFamily,
      }}>
        初始化失败: {error}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily,
      ...style,
    }} className={className}>
      {/* Messages */}
      <MessageList
        messages={messages}
        primaryColor={primaryColor}
      />

      {/* Welcome */}
      {messages.length === 0 && isReady && welcomeMessage && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#666',
        }}>
          {welcomeMessage}
        </div>
      )}

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div style={{
          padding: '8px 16px',
          background: '#fafafa',
          borderBottom: '1px solid #e8e8e8',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          {pendingFiles.map((f, i) => (
            <div key={i} style={{
              padding: '4px 8px',
              background: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              fontSize: 12,
            }}>
              📎 {f.name}
              <button
                onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                style={{ marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: '10px 12px',
        borderTop: '1px solid #f3f4f6',
        background: '#fff',
      }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || !isReady}
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            opacity: isStreaming || !isReady ? 0.5 : 1,
          }}
        >
          📎
        </button>

        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          disabled={isStreaming || !isReady}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 14,
            fontFamily,
            outline: 'none',
            maxHeight: 120,
          }}
          rows={1}
        />

        {isStreaming ? (
          <button
            onClick={handleStop}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              border: 'none',
              borderRadius: 10,
              background: '#ef4444',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            ⏹
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!isReady || (!inputValue.trim() && pendingFiles.length === 0)}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              border: 'none',
              borderRadius: 10,
              background: primaryColor,
              color: '#fff',
              cursor: 'pointer',
              opacity: !isReady || (!inputValue.trim() && pendingFiles.length === 0) ? 0.5 : 1,
            }}
          >
            ➤
          </button>
        )}
      </div>
    </div>
  );
}
