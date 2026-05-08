import React from 'react';
import type { ChartSkillResult, ChartType } from './index';
export interface ChartProps {
    /** Chart data from chart_skill result */
    data: ChartSkillResult;
    /** Width of the chart (default: 100%) */
    width?: string | number;
    /** Height of the chart (default: 280px) */
    height?: string | number;
    /** Show chart type switcher (default: true) */
    showTypeSwitcher?: boolean;
    /** Primary color for switcher buttons (default: #1890ff) */
    primaryColor?: string;
    /** Callback when chart type is changed */
    onChartTypeChange?: (newType: ChartType) => void;
    /** Additional style for wrapper */
    style?: React.CSSProperties;
    /** Additional className for wrapper */
    className?: string;
}
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
export declare function Chart({ data, width, height, showTypeSwitcher, primaryColor, onChartTypeChange, style, className, }: ChartProps): JSX.Element;
export interface MessageData {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    state?: 'streaming' | 'done' | 'error';
    chartData?: ChartSkillResult;
}
export interface MessageProps {
    message: MessageData;
    /** Primary color for chart switcher (default: #1890ff) */
    primaryColor?: string;
    /** Custom markdown renderer (default: simple rendering) */
    renderMarkdown?: (content: string) => React.ReactNode;
    /** Custom chart renderer (default: use Chart component) */
    renderChart?: (chartData: ChartSkillResult) => React.ReactNode;
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
export declare function Message({ message, primaryColor, renderMarkdown: customRenderMarkdown, renderChart: customRenderChart, }: MessageProps): JSX.Element;
export interface MessageListProps {
    messages: MessageData[];
    /** Primary color for user messages and chart switcher */
    primaryColor?: string;
    /** Custom markdown renderer */
    renderMarkdown?: (content: string) => React.ReactNode;
    /** Custom chart renderer */
    renderChart?: (chartData: ChartSkillResult) => React.ReactNode;
    /** Style for the container */
    style?: React.CSSProperties;
    /** ClassName for the container */
    className?: string;
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
export declare function MessageList({ messages, primaryColor, renderMarkdown, renderChart, style, className, }: MessageListProps): JSX.Element;
//# sourceMappingURL=components.d.ts.map