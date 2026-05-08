// React MessageList component

import React, { useEffect, useRef } from 'react';
import type { Message, ChartSkillResult } from '../core/types';
import { Chart } from './Chart';

export interface MessageListProps {
  messages: Message[];
  primaryColor?: string;
  /** Custom markdown renderer */
  renderMarkdown?: (content: string) => React.ReactNode;
  /** Custom chart renderer */
  renderChart?: (chartData: ChartSkillResult) => React.ReactNode;
  /** Container style */
  style?: React.CSSProperties;
  /** Container className */
  className?: string;
}

/** Default markdown renderer (simple) */
function defaultRenderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {line || '\u00A0'}
      {i < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

export function MessageList({
  messages,
  primaryColor = '#1890ff',
  renderMarkdown,
  renderChart,
  style,
  className,
}: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const renderMd = renderMarkdown ?? defaultRenderMarkdown;

  // Auto scroll
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
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const isStreaming = msg.state === 'streaming';

        return (
          <div
            key={msg.id}
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
              {/* Files */}
              {msg.files && msg.files.length > 0 && (
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  {msg.files.map((f, i) => (
                    <div key={i} style={{ fontSize: 12 }}>📎 {f.name}</div>
                  ))}
                </div>
              )}

              {/* Content */}
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                {renderMd(msg.content || (isStreaming ? '...' : ''))}

                {/* Chart */}
                {msg.chartData && (
                  renderChart
                    ? renderChart(msg.chartData)
                    : <Chart data={msg.chartData} primaryColor={primaryColor} />
                )}
              </div>

              {/* Loading */}
              {isStreaming && !msg.content && (
                <span>正在思考...</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
