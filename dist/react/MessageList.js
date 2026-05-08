import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
// React MessageList component
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Chart } from './Chart';
export function MessageList({ messages, primaryColor = '#1890ff', typewriter = true, typewriterSpeed = 20, renderMarkdown, renderChart, style, className, }) {
    const listRef = useRef(null);
    const [displayedContent, setDisplayedContent] = useState(new Map());
    // Track streaming messages for typewriter effect
    const streamingMsg = useMemo(() => messages.find(m => m.state === 'streaming' && m.content), [messages]);
    // Typewriter effect
    useEffect(() => {
        if (!typewriter || !streamingMsg) {
            // Reset displayed content when not using typewriter or no streaming
            setDisplayedContent(new Map());
            return;
        }
        const targetContent = streamingMsg.content || '';
        const currentDisplayed = displayedContent.get(streamingMsg.id) || '';
        if (targetContent.length <= currentDisplayed.length) {
            // Content reset or same, update directly
            setDisplayedContent(prev => new Map(prev).set(streamingMsg.id, targetContent));
            return;
        }
        // Start from current displayed length and add characters
        let currentIndex = currentDisplayed.length;
        const interval = setInterval(() => {
            if (currentIndex < targetContent.length) {
                currentIndex++;
                setDisplayedContent(prev => new Map(prev).set(streamingMsg.id, targetContent.slice(0, currentIndex)));
            }
            else {
                clearInterval(interval);
            }
        }, typewriterSpeed);
        return () => clearInterval(interval);
    }, [typewriter, streamingMsg?.id, streamingMsg?.content, typewriterSpeed]);
    // Reset displayed content when message is done
    useEffect(() => {
        messages.forEach(msg => {
            if (msg.state === 'done' && displayedContent.has(msg.id)) {
                setDisplayedContent(prev => {
                    const next = new Map(prev);
                    next.delete(msg.id);
                    return next;
                });
            }
        });
    }, [messages]);
    // Auto scroll
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages, displayedContent]);
    return (_jsxs("div", { ref: listRef, style: {
            flex: 1,
            overflow: 'auto',
            padding: 16,
            ...style,
        }, className: className, children: [messages.map((msg) => {
                const isUser = msg.role === 'user';
                const isStreaming = msg.state === 'streaming';
                // Use typewriter content for streaming messages, otherwise use full content
                const content = (typewriter && isStreaming && displayedContent.has(msg.id))
                    ? displayedContent.get(msg.id)
                    : msg.content;
                return (_jsx("div", { style: {
                        display: 'flex',
                        justifyContent: isUser ? 'flex-end' : 'flex-start',
                        marginBottom: 12,
                    }, children: _jsxs("div", { style: {
                            maxWidth: '70%',
                            padding: '10px 14px',
                            borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                            background: isUser ? primaryColor : '#f5f5f5',
                            color: isUser ? '#fff' : '#1a1a1a',
                        }, children: [msg.files && msg.files.length > 0 && (_jsx("div", { style: { marginBottom: 8, opacity: 0.8 }, children: msg.files.map((f, i) => (_jsxs("div", { style: { fontSize: 12 }, children: ["\uD83D\uDCCE ", f.name] }, i))) })), _jsxs("div", { style: { fontSize: 14, lineHeight: 1.6 }, children: [renderMarkdown
                                        ? renderMarkdown(content || '')
                                        : _jsx(DefaultMarkdown, { content: content || '', isUser: isUser }), msg.chartData && (renderChart
                                        ? renderChart(msg.chartData)
                                        : _jsx(Chart, { data: msg.chartData, primaryColor: primaryColor }))] }), isStreaming && !msg.content && (_jsx("span", { children: "\u6B63\u5728\u601D\u8003..." })), isStreaming && content && (_jsx("span", { style: {
                                    display: 'inline-block',
                                    width: 2,
                                    height: 16,
                                    background: 'currentColor',
                                    marginLeft: 2,
                                    animation: 'blink 1s infinite',
                                    verticalAlign: 'text-bottom'
                                } }))] }) }, msg.id));
            }), _jsx("style", { children: `
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      ` })] }));
}
/** Default markdown renderer using react-markdown */
function DefaultMarkdown({ content, isUser }) {
    // Try to use react-markdown if available
    try {
        // Dynamic import would be better but for now we check if it's available
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ReactMarkdown = require('react-markdown');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const remarkGfm = require('remark-gfm');
        return (_jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], components: {
                // Style elements for chat bubble
                p: ({ children }) => _jsx("p", { style: { margin: 0 }, children: children }),
                a: ({ href, children }) => (_jsx("a", { href: href, target: "_blank", rel: "noopener noreferrer", style: { color: isUser ? '#e6f7ff' : primaryColor }, children: children })),
                code: ({ className, children }) => {
                    const isInline = !className;
                    return isInline ? (_jsx("code", { style: {
                            background: isUser ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 13,
                        }, children: children })) : (_jsx("code", { style: {
                            display: 'block',
                            background: isUser ? 'rgba(255,255,255,0.1)' : '#f0f0f0',
                            padding: '8px 12px',
                            borderRadius: 6,
                            fontSize: 13,
                            overflowX: 'auto',
                        }, children: children }));
                },
                ul: ({ children }) => _jsx("ul", { style: { margin: '8px 0', paddingLeft: 20 }, children: children }),
                ol: ({ children }) => _jsx("ol", { style: { margin: '8px 0', paddingLeft: 20 }, children: children }),
                li: ({ children }) => _jsx("li", { style: { margin: '4px 0' }, children: children }),
                strong: ({ children }) => _jsx("strong", { style: { fontWeight: 600 }, children: children }),
                blockquote: ({ children }) => (_jsx("blockquote", { style: {
                        borderLeft: `3px solid ${isUser ? 'rgba(255,255,255,0.3)' : '#d9d9d9'}`,
                        margin: '8px 0',
                        paddingLeft: 12,
                        opacity: 0.9,
                    }, children: children })),
            }, children: content }));
    }
    catch {
        // Fallback: simple line-by-line rendering
        return _jsx(FallbackMarkdown, { content: content });
    }
}
/** Fallback markdown renderer when react-markdown is not available */
function FallbackMarkdown({ content }) {
    const lines = content.split('\n');
    return (_jsx(_Fragment, { children: lines.map((line, i) => (_jsxs(React.Fragment, { children: [line || '\u00A0', i < lines.length - 1 && _jsx("br", {})] }, i))) }));
}
// Reference for primary color in DefaultMarkdown
const primaryColor = '#1890ff';
//# sourceMappingURL=MessageList.js.map