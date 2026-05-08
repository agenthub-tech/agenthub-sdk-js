import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// React components for agenthub-sdk
// These components provide ready-to-use UI for built-in skills
import React, { useEffect, useRef } from 'react';
const CHART_TYPE_LABELS = {
    'bar': '柱状图',
    'line': '折线图',
    'pie': '饼图',
    'bar-horizontal': '条形图',
};
/**
 * Chart component that renders chart_skill results with type switching.
 *
 * Usage:
 * ```tsx
 * import { Chart } from 'agenthub-sdk/react';
 *
 * <Chart data={chartData} />
 * ```
 */
export function Chart({ data, width, height, showTypeSwitcher = true, primaryColor = '#1890ff', onChartTypeChange, style, className, }) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const [currentType, setCurrentType] = React.useState(data.chart_type);
    // Initialize chart
    useEffect(() => {
        if (!containerRef.current)
            return;
        let mounted = true;
        const loadAndRender = async () => {
            try {
                const echarts = await import('echarts');
                if (!mounted || !containerRef.current)
                    return;
                const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
                chart.setOption(data.echarts_option);
                chartRef.current = {
                    dispose: () => chart.dispose(),
                    setChartType: (type) => {
                        const newOption = data.echarts_options[type];
                        if (newOption) {
                            chart.setOption(newOption, true);
                        }
                    },
                };
            }
            catch (err) {
                console.error('[agenthub-sdk] Failed to load echarts:', err);
            }
        };
        loadAndRender();
        return () => {
            mounted = false;
            if (chartRef.current) {
                chartRef.current.dispose();
                chartRef.current = null;
            }
        };
    }, [data]);
    // Handle chart type change
    const handleTypeChange = (type) => {
        if (type === currentType)
            return;
        setCurrentType(type);
        chartRef.current?.setChartType(type);
        onChartTypeChange?.(type);
    };
    const hasMultipleTypes = showTypeSwitcher && data.available_chart_types.length > 1;
    return (_jsxs("div", { style: { marginTop: 12, ...style }, className: className, children: [_jsx("div", { ref: containerRef, style: {
                    width: width ?? '100%',
                    height: typeof height === 'number' ? `${height}px` : (height ?? '280px'),
                    background: '#fafafa',
                    borderRadius: 8,
                } }), hasMultipleTypes && (_jsx("div", { style: { marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8 }, children: data.available_chart_types.map((type) => (_jsx("button", { onClick: () => handleTypeChange(type), style: {
                        padding: '4px 12px',
                        borderRadius: 6,
                        border: type === currentType ? 'none' : '1px solid #d9d9d9',
                        background: type === currentType ? primaryColor : '#fff',
                        color: type === currentType ? '#fff' : '#333',
                        fontSize: 12,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                    }, children: CHART_TYPE_LABELS[type] ?? type }, type))) }))] }));
}
/**
 * Message component for rendering chat messages with optional chart.
 *
 * Usage:
 * ```tsx
 * import { Message } from 'agenthub-sdk/react';
 *
 * <Message message={msg} />
 * ```
 */
export function Message({ message, primaryColor = '#1890ff', renderMarkdown: customRenderMarkdown, renderChart: customRenderChart, }) {
    const isUser = message.role === 'user';
    const isStreaming = message.state === 'streaming';
    // Default markdown renderer (simple)
    const defaultRenderMarkdown = (content) => {
        // Basic markdown: paragraphs, bold, italic, code
        const lines = content.split('\n');
        return lines.map((line, i) => (_jsxs(React.Fragment, { children: [line || '\u00A0', i < lines.length - 1 && _jsx("br", {})] }, i)));
    };
    const renderMarkdown = customRenderMarkdown ?? defaultRenderMarkdown;
    const renderChart = customRenderChart ?? ((chartData) => (_jsx(Chart, { data: chartData, primaryColor: primaryColor })));
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
            }, children: [_jsxs("div", { style: { fontSize: 14, lineHeight: 1.6 }, children: [renderMarkdown(message.content || (isStreaming ? '...' : '')), message.chartData && renderChart(message.chartData)] }), isStreaming && !message.content && (_jsx("span", { children: "\u6B63\u5728\u601D\u8003..." }))] }) }));
}
/**
 * MessageList component for rendering a list of chat messages.
 *
 * Usage:
 * ```tsx
 * import { MessageList } from 'agenthub-sdk/react';
 *
 * <MessageList messages={messages} />
 * ```
 */
export function MessageList({ messages, primaryColor = '#1890ff', renderMarkdown, renderChart, style, className, }) {
    const listRef = useRef(null);
    // Auto scroll to bottom
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
        }, className: className, children: messages.map((msg) => (_jsx(Message, { message: msg, primaryColor: primaryColor, renderMarkdown: renderMarkdown, renderChart: renderChart }, msg.id))) }));
}
//# sourceMappingURL=components.js.map