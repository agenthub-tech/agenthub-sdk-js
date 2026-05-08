// React components for agenthub-sdk
// These components provide ready-to-use UI for built-in skills

import React, { useEffect, useRef } from 'react';
import type { ChartSkillResult, ChartType } from './index';

// ── Chart Component ─────────────────────────────────────────────────────────

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

const CHART_TYPE_LABELS: Record<ChartType, string> = {
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
export function Chart({
  data,
  width,
  height,
  showTypeSwitcher = true,
  primaryColor = '#1890ff',
  onChartTypeChange,
  style,
  className,
}: ChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ dispose: () => void; setChartType: (type: ChartType) => void } | null>(null);
  const [currentType, setCurrentType] = React.useState<ChartType>(data.chart_type);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;

    const loadAndRender = async () => {
      try {
        const echarts = await import('echarts');
        if (!mounted || !containerRef.current) return;

        const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
        chart.setOption(data.echarts_option);

        chartRef.current = {
          dispose: () => chart.dispose(),
          setChartType: (type: ChartType) => {
            const newOption = data.echarts_options[type];
            if (newOption) {
              chart.setOption(newOption, true);
            }
          },
        };
      } catch (err) {
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
  const handleTypeChange = (type: ChartType) => {
    if (type === currentType) return;
    setCurrentType(type);
    chartRef.current?.setChartType(type);
    onChartTypeChange?.(type);
  };

  const hasMultipleTypes = showTypeSwitcher && data.available_chart_types.length > 1;

  return (
    <div style={{ marginTop: 12, ...style }} className={className}>
      <div
        ref={containerRef}
        style={{
          width: width ?? '100%',
          height: typeof height === 'number' ? `${height}px` : (height ?? '280px'),
          background: '#fafafa',
          borderRadius: 8,
        }}
      />
      {hasMultipleTypes && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8 }}>
          {data.available_chart_types.map((type) => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: type === currentType ? 'none' : '1px solid #d9d9d9',
                background: type === currentType ? primaryColor : '#fff',
                color: type === currentType ? '#fff' : '#333',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {CHART_TYPE_LABELS[type] ?? type}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Message Component ────────────────────────────────────────────────────────

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
export function Message({
  message,
  primaryColor = '#1890ff',
  renderMarkdown: customRenderMarkdown,
  renderChart: customRenderChart,
}: MessageProps): JSX.Element {
  const isUser = message.role === 'user';
  const isStreaming = message.state === 'streaming';

  // Default markdown renderer (simple)
  const defaultRenderMarkdown = (content: string): React.ReactNode => {
    // Basic markdown: paragraphs, bold, italic, code
    const lines = content.split('\n');
    return lines.map((line, i) => (
      <React.Fragment key={i}>
        {line || '\u00A0'}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    ));
  };

  const renderMarkdown = customRenderMarkdown ?? defaultRenderMarkdown;
  const renderChart = customRenderChart ?? ((chartData: ChartSkillResult) => (
    <Chart data={chartData} primaryColor={primaryColor} />
  ));

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: '70%',
          padding: '10px 14px',
          borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: isUser ? primaryColor : '#f5f5f5',
          color: isUser ? '#fff' : '#1a1a1a',
        }}
      >
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          {renderMarkdown(message.content || (isStreaming ? '...' : ''))}
          {message.chartData && renderChart(message.chartData)}
        </div>
        {isStreaming && !message.content && (
          <span>正在思考...</span>
        )}
      </div>
    </div>
  );
}

// ── MessageList Component ────────────────────────────────────────────────────

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
export function MessageList({
  messages,
  primaryColor = '#1890ff',
  renderMarkdown,
  renderChart,
  style,
  className,
}: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={listRef}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 16,
        ...style,
      }}
      className={className}
    >
      {messages.map((msg) => (
        <Message
          key={msg.id}
          message={msg}
          primaryColor={primaryColor}
          renderMarkdown={renderMarkdown}
          renderChart={renderChart}
        />
      ))}
    </div>
  );
}
