// React MessageList component

import React, { useEffect, useRef, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ChartSkillResult } from '../core/types';
import { Chart } from './Chart';

function AttachmentIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} aria-hidden="true">
      <path
        d="M516.373333 375.978667l136.576-136.576a147.797333 147.797333 0 0 1 208.853334-0.021334 147.690667 147.690667 0 0 1-0.042667 208.832l-204.8 204.778667v0.021333l-153.621333 153.6c-85.973333 85.973333-225.28 85.973333-311.253334 0.021334-85.994667-85.973333-85.973333-225.216 0.149334-311.36L431.146667 256.362667a21.333333 21.333333 0 0 0-30.165334-30.165334L162.069333 465.066667c-102.805333 102.826667-102.826667 269.056-0.149333 371.733333 102.613333 102.613333 268.970667 102.613333 371.584 0l153.6-153.642667h0.021333l0.021334-0.021333 204.778666-204.778667c74.325333-74.325333 74.346667-194.858667 0.021334-269.184-74.24-74.24-194.88-74.24-269.162667 0.042667l-136.576 136.554667-187.626667 187.626666a117.845333 117.845333 0 0 0-0.106666 166.826667 118.037333 118.037333 0 0 0 166.826666-0.106667l255.850667-255.829333a21.333333 21.333333 0 0 0-30.165333-30.165333L435.136 669.973333a75.370667 75.370667 0 0 1-106.496 0.106667 75.178667 75.178667 0 0 1 0.128-106.496l187.605333-187.605333z"
        fill="currentColor"
      />
    </svg>
  );
}

export interface MessageListProps {
  messages: Message[];
  primaryColor?: string;
  /** Enable typewriter effect for streaming messages */
  typewriter?: boolean;
  /** Typewriter speed in ms per character */
  typewriterSpeed?: number;
  /** Custom markdown renderer */
  renderMarkdown?: (content: string) => React.ReactNode;
  /** Custom chart renderer */
  renderChart?: (chartData: ChartSkillResult) => React.ReactNode;
  /** Container style */
  style?: React.CSSProperties;
  /** Container className */
  className?: string;
}

export function MessageList({
  messages,
  primaryColor = '#1890ff',
  typewriter = true,
  typewriterSpeed = 20,
  renderMarkdown,
  renderChart,
  style,
  className,
}: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const [displayedContent, setDisplayedContent] = useState<Map<string, string>>(new Map());

  // Track streaming messages for typewriter effect
  const streamingMsg = useMemo(() => 
    messages.find(m => m.state === 'streaming' && m.content),
    [messages]
  );

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
      } else {
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
        
        // Use typewriter content for streaming messages, otherwise use full content
        const content = (typewriter && isStreaming && displayedContent.has(msg.id))
          ? displayedContent.get(msg.id)!
          : msg.content;

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
                    <div key={i} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AttachmentIcon />
                      <span>{f.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Content */}
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                {renderMarkdown 
                  ? renderMarkdown(content || '')
                  : <DefaultMarkdown content={content || ''} isUser={isUser} />
                }

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
              
              {/* Typing cursor */}
              {isStreaming && content && (
                <span style={{ 
                  display: 'inline-block', 
                  width: 2, 
                  height: 16, 
                  background: 'currentColor',
                  marginLeft: 2,
                  animation: 'blink 1s infinite',
                  verticalAlign: 'text-bottom'
                }} />
              )}
            </div>
          </div>
        );
      })}
      
      {/* Keyframe for cursor blink */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/** Default markdown renderer using react-markdown */
function DefaultMarkdown({ content, isUser }: { content: string; isUser: boolean }): JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
          p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
          a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: isUser ? '#e6f7ff' : primaryColor }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }: { src?: string; alt?: string }) => (
            <img
              src={src}
              alt={alt || ''}
              loading="lazy"
              style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '8px 0', borderRadius: 8 }}
            />
          ),
          table: ({ children }: { children?: React.ReactNode }) => (
            <table style={{ display: 'block', maxWidth: '100%', overflowX: 'auto', borderCollapse: 'collapse', margin: '8px 0' }}>
              {children}
            </table>
          ),
          th: ({ children }: { children?: React.ReactNode }) => (
            <th style={{ padding: '6px 10px', border: '1px solid #d9d9d9', background: 'rgba(0,0,0,0.04)', textAlign: 'left' }}>
              {children}
            </th>
          ),
          td: ({ children }: { children?: React.ReactNode }) => (
            <td style={{ padding: '6px 10px', border: '1px solid #d9d9d9' }}>{children}</td>
          ),
          code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
            const isInline = !className;
            return isInline ? (
              <code style={{
                background: isUser ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 13,
              }}>
                {children}
              </code>
            ) : (
              <code style={{
                display: 'block',
                background: isUser ? 'rgba(255,255,255,0.1)' : '#f0f0f0',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 13,
                overflowX: 'auto',
              }}>
                {children}
              </code>
            );
          },
          ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ margin: '8px 0', paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ margin: '8px 0', paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }: { children?: React.ReactNode }) => <li style={{ margin: '4px 0' }}>{children}</li>,
          strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote style={{
              borderLeft: `3px solid ${isUser ? 'rgba(255,255,255,0.3)' : '#d9d9d9'}`,
              margin: '8px 0',
              paddingLeft: 12,
              opacity: 0.9,
            }}>
              {children}
            </blockquote>
          ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// Reference for primary color in DefaultMarkdown
const primaryColor = '#1890ff';
