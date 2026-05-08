import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// React MessageList component
import React, { useEffect, useRef } from 'react';
import { Chart } from './Chart';
/** Default markdown renderer (simple) */
function defaultRenderMarkdown(content) {
    const lines = content.split('\n');
    return lines.map((line, i) => (_jsxs(React.Fragment, { children: [line || '\u00A0', i < lines.length - 1 && _jsx("br", {})] }, i)));
}
export function MessageList({ messages, primaryColor = '#1890ff', renderMarkdown, renderChart, style, className, }) {
    const listRef = useRef(null);
    const renderMd = renderMarkdown ?? defaultRenderMarkdown;
    // Auto scroll
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages]);
    return (_jsx("div", { ref: listRef, style: {
            flex: 1,
            overflow: 'auto',
            padding: 16,
            ...style,
        }, className: className, children: messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isStreaming = msg.state === 'streaming';
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
                    }, children: [msg.files && msg.files.length > 0 && (_jsx("div", { style: { marginBottom: 8, opacity: 0.8 }, children: msg.files.map((f, i) => (_jsxs("div", { style: { fontSize: 12 }, children: ["\uD83D\uDCCE ", f.name] }, i))) })), _jsxs("div", { style: { fontSize: 14, lineHeight: 1.6 }, children: [renderMd(msg.content || (isStreaming ? '...' : '')), msg.chartData && (renderChart
                                    ? renderChart(msg.chartData)
                                    : _jsx(Chart, { data: msg.chartData, primaryColor: primaryColor }))] }), isStreaming && !msg.content && (_jsx("span", { children: "\u6B63\u5728\u601D\u8003..." }))] }) }, msg.id));
        }) }));
}
//# sourceMappingURL=MessageList.js.map